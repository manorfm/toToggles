package usecase

import (
	"context"
	"log"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/domain/policy"
	"github.com/manorfm/totoogle/internal/app/domain/repository"
)

// Exportados (não só usados internamente) porque o handler HTTP precisa do mesmo valor pra
// decidir quantas linhas pedir a mais e detectar se existe próxima página — ver
// handler/audit_handler.go#GetAuditLog.
const (
	DefaultAuditPageSize = 30
	MaxAuditPageSize     = 100
)

// teamAudienceResolver resolve o(s) time(s) relevante(s) de uma aplicação ou de um usuário —
// interface estreita (ISP, mesmo padrão de domain/policy) satisfeita estruturalmente por
// repository.TeamRepository, sem precisar declarar isso explicitamente. Usada só pra achar o
// team_id de um evento quando o chamador só tem um applicationID/userID em mãos (RecordFor*),
// não um teamID já resolvido.
type teamAudienceResolver interface {
	GetTeamsByApplicationID(applicationID string) ([]*entity.Team, error)
	GetTeamsByUserID(userID string) ([]*entity.Team, error)
}

// AuditUseCase grava e lista o audit trail (entity.AuditLog).
type AuditUseCase struct {
	repo         repository.AuditLogRepository
	access       *policy.AuditAccess
	teamAudience teamAudienceResolver
}

func NewAuditUseCase(repo repository.AuditLogRepository, access *policy.AuditAccess, teamAudience teamAudienceResolver) *AuditUseCase {
	return &AuditUseCase{repo: repo, access: access, teamAudience: teamAudience}
}

// Record grava um evento. Chamado no ponto exato de cada mutação (nos outros usecases, não em
// middleware — ver server/CLAUDE.md sobre por quê: um middleware amarrado à requisição HTTP
// original nunca veria a execução adiada de uma ação aprovada, que acontece numa requisição
// separada bem depois). actor é quem está fazendo a chamada agora — inclusive na execução
// adiada, é o aprovador que chamou .../execute, nunca o solicitante original (mesma escolha do
// protótipo real: logAudit sempre usa currentUser, não quem pediu a ação).
//
// Nunca falha a operação principal: um erro ao gravar auditoria é só logado, nunca propagado —
// a mutação de negócio já aconteceu e não deveria ser desfeita nem reportada como erro só
// porque o rastro dela falhou ao gravar.
func (uc *AuditUseCase) Record(eventType entity.AuditEventType, text, target string, teamID *string, actor *entity.User) {
	if actor == nil {
		return
	}
	// actor.Name (nome completo), não actor.Username — confirmado no protótipo real
	// (logAudit sempre usa `currentUser.name`); ActorName também alimenta os initials mostrados
	// na timeline (ver lib/userDisplay.ts#initialsOf no frontend), que só fazem sentido a partir
	// do nome completo, não do username.
	entry := entity.NewAuditLog(eventType, text, target, teamID, actor.ID, actor.Name)
	if err := uc.repo.Create(context.Background(), entry); err != nil {
		log.Printf("[ERROR] AuditUseCase.Record: failed to write audit log (event_type=%s): %v", eventType, err)
	}
}

// systemActorID/systemActorName identificam o ator sintético usado por RecordSystem — nenhum
// entity.User de verdade existe (o pedido acontece antes de qualquer sessão), então não há um ID
// real de usuário pra usar. Confirmado no protótipo real (app.jsx#requestPasswordReset:
// `actor: "System", initials: "SY"`).
const (
	systemActorID   = "system"
	systemActorName = "System"
)

// RecordSystem grava um evento que não tem um usuário autenticado por trás — hoje só o pedido de
// "esqueci minha senha" (v2.6 §5.5), que acontece na tela de login, antes de qualquer sessão
// existir. team_id é sempre nil (evento global, visível só a root — mesma regra de
// approval_system_toggled, o outro evento sem team_id deste sistema). Mesma garantia de Record:
// nunca falha a operação principal, um erro ao gravar é só logado.
func (uc *AuditUseCase) RecordSystem(eventType entity.AuditEventType, text, target string) {
	entry := entity.NewAuditLog(eventType, text, target, nil, systemActorID, systemActorName)
	if err := uc.repo.Create(context.Background(), entry); err != nil {
		log.Printf("[ERROR] AuditUseCase.RecordSystem: failed to write audit log (event_type=%s): %v", eventType, err)
	}
}

// RecordForApplication resolve o team_id a partir da aplicação (o primeiro time com acesso a
// ela — mesma simplificação de "um time só" já aceita em ApprovalRequest.TeamID/
// GetUserTeamForApplication; uma aplicação pode ter mais de um time via team_applications, mas
// só um é gravado) antes de chamar Record. team_id fica nil (evento some pra quem não é root)
// se a aplicação não tiver nenhum time associado ou a busca falhar — nunca propaga esse erro
// pro chamador, pelo mesmo motivo de Record nunca propagar erro de escrita.
func (uc *AuditUseCase) RecordForApplication(eventType entity.AuditEventType, text, target, applicationID string, actor *entity.User) {
	uc.Record(eventType, text, target, uc.firstTeamIDFor(uc.teamAudience.GetTeamsByApplicationID, applicationID), actor)
}

// RecordForUser resolve o team_id a partir do usuário afetado (o primeiro time do qual é
// membro) — aproximação deliberada da regra canManageUser (que é "compartilha QUALQUER time",
// não "o primeiro"): ver domain/policy.AuditAccess pro raciocínio completo.
func (uc *AuditUseCase) RecordForUser(eventType entity.AuditEventType, text, target, targetUserID string, actor *entity.User) {
	uc.Record(eventType, text, target, uc.firstTeamIDFor(uc.teamAudience.GetTeamsByUserID, targetUserID), actor)
}

func (uc *AuditUseCase) firstTeamIDFor(lookup func(string) ([]*entity.Team, error), id string) *string {
	teams, err := lookup(id)
	if err != nil || len(teams) == 0 {
		return nil
	}
	return &teams[0].ID
}

// List devolve uma página do audit trail visível pra caller (domain/policy.AuditAccess),
// filtrada por category quando informada, a partir de cursor (nil = primeira página). limit é
// ajustado pro intervalo [1, MaxAuditPageSize], usando DefaultAuditPageSize quando <= 0.
func (uc *AuditUseCase) List(ctx context.Context, caller *entity.User, category entity.AuditCategory, cursor *repository.AuditLogCursor, limit int) ([]*entity.AuditLog, error) {
	teamIDs, unrestricted, err := uc.access.VisibleTeamIDs(ctx, caller)
	if err != nil {
		return nil, entity.NewAppError(entity.ErrCodeDatabase, "error resolving audit visibility")
	}

	switch {
	case limit <= 0:
		limit = DefaultAuditPageSize
	case limit > MaxAuditPageSize:
		limit = MaxAuditPageSize
	}

	logs, err := uc.repo.List(ctx, teamIDs, unrestricted, category, cursor, limit)
	if err != nil {
		return nil, entity.NewAppError(entity.ErrCodeDatabase, "error fetching audit log")
	}
	return logs, nil
}
