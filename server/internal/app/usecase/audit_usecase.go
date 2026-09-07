package usecase

import (
	"context"
	"log"
	"time"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
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
	teamAudience teamAudienceResolver
}

func NewAuditUseCase(repo repository.AuditLogRepository, teamAudience teamAudienceResolver) *AuditUseCase {
	return &AuditUseCase{repo: repo, teamAudience: teamAudience}
}

// record é o único caminho que de fato persiste uma entrada — todo método público Record*
// funciona nele, cada um só decidindo COMO chegar em teamID/applicationID/before/after. Nunca
// falha a operação principal: um erro ao gravar auditoria é só logado, nunca propagado — a
// mutação de negócio já aconteceu e não deveria ser desfeita nem reportada como erro só porque o
// rastro dela falhou ao gravar.
func (uc *AuditUseCase) record(eventType entity.AuditEventType, text, target string, teamID, applicationID, before, after *string, actor *entity.User) {
	if actor == nil {
		return
	}
	// actor.Name (nome completo), não actor.Username — confirmado no protótipo real
	// (logAudit sempre usa `currentUser.name`); ActorName também alimenta os initials mostrados
	// na timeline (ver lib/userDisplay.ts#initialsOf no frontend), que só fazem sentido a partir
	// do nome completo, não do username.
	entry := entity.NewAuditLog(eventType, text, target, teamID, actor.ID, actor.Name)
	entry.ApplicationID = applicationID
	entry.Before = before
	entry.After = after
	if err := uc.repo.Create(context.Background(), entry); err != nil {
		log.Printf("[ERROR] AuditUseCase.record: failed to write audit log (event_type=%s): %v", eventType, err)
	}
}

// Record grava um evento sem aplicação/before/after associados (times/usuários/aprovações) —
// chamado no ponto exato de cada mutação (nos outros usecases, não em middleware — ver
// server/CLAUDE.md sobre por quê: um middleware amarrado à requisição HTTP original nunca veria
// a execução adiada de uma ação aprovada, que acontece numa requisição separada bem depois).
// actor é quem está fazendo a chamada agora — inclusive na execução adiada, é o aprovador que
// chamou .../execute, nunca o solicitante original (mesma escolha do protótipo real: logAudit
// sempre usa currentUser, não quem pediu a ação).
func (uc *AuditUseCase) Record(eventType entity.AuditEventType, text, target string, teamID *string, actor *entity.User) {
	uc.record(eventType, text, target, teamID, nil, nil, nil, actor)
}

// RecordWithApplication grava um evento com teamID E applicationID já resolvidos por quem chama
// — ao contrário de RecordForApplication, que sempre RE-resolve team_id a partir da aplicação
// (uma consulta a mais, desnecessária quando o chamador já tem os dois valores prontos e
// autoritativos). Único uso hoje: ApprovalUseCase.ExecuteApprovedAction, que grava o evento de
// domínio final de uma ação aprovada e já tem `request.TeamID`/`request.ApplicationID` em mãos —
// aqui é onde o gap real ficava: toda ação que passa pelo workflow de aprovação nunca carregava
// application_id no seu evento final, só o caminho de execução DIRETA (RecordForApplication/
// RecordRuleChange) tinha sido migrado antes.
func (uc *AuditUseCase) RecordWithApplication(eventType entity.AuditEventType, text, target string, teamID, applicationID *string, actor *entity.User) {
	uc.record(eventType, text, target, teamID, applicationID, nil, nil, actor)
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
// só um é gravado) e grava application_id (v2.6 §7) — a aplicação referida precisa existir no
// momento da chamada pra essa resolução funcionar (o único caso em que não é seguro chamar isto
// é DEPOIS de a aplicação já ter sido apagada, quando não há mais nada pra resolver — ver
// ApplicationHandler.DeleteApplication, que continua usando Record com team_id pré-resolvido
// antes do delete). team_id fica nil (evento some pra quem não é root) se a aplicação não tiver
// nenhum time associado ou a busca falhar — nunca propaga esse erro pro chamador, pelo mesmo
// motivo de Record nunca propagar erro de escrita.
func (uc *AuditUseCase) RecordForApplication(eventType entity.AuditEventType, text, target, applicationID string, actor *entity.User) {
	teamID := uc.firstTeamIDFor(uc.teamAudience.GetTeamsByApplicationID, applicationID)
	uc.record(eventType, text, target, teamID, &applicationID, nil, nil, actor)
}

// RecordRuleChange grava a mudança de regra de ativação de um toggle com o estado ANTES/DEPOIS
// anexado (v2.6 §7) — o único evento que carrega before/after hoje. Mesma resolução de team_id de
// RecordForApplication; método próprio em vez de mais dois parâmetros opcionais em
// RecordForApplication porque before/after só fazem sentido pra este único evento
// (toggle_rule_set), não pros outros ~15 que reusam RecordForApplication.
func (uc *AuditUseCase) RecordRuleChange(text, target, applicationID, before, after string, actor *entity.User) {
	teamID := uc.firstTeamIDFor(uc.teamAudience.GetTeamsByApplicationID, applicationID)
	uc.record(entity.AuditEventToggleRuleSet, text, target, teamID, &applicationID, &before, &after, actor)
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

func clampAuditLimit(limit int) int {
	switch {
	case limit <= 0:
		return DefaultAuditPageSize
	case limit > MaxAuditPageSize:
		return MaxAuditPageSize
	default:
		return limit
	}
}

// AuditListOptions agrupa os filtros de List que vêm da requisição HTTP (v2.6 §7: category já
// existia, ActorID/CreatedAfter são novos).
type AuditListOptions struct {
	Category     entity.AuditCategory
	ActorID      string
	CreatedAfter *time.Time
}

// List devolve uma página de TODO o audit trail (History), filtrada por opts quando informados, a
// partir de cursor (nil = primeira página). limit é ajustado pro intervalo [1, MaxAuditPageSize],
// usando DefaultAuditPageSize quando <= 0. Sem checagem de visibilidade por time: só root chega
// aqui (GET /api/audit exige RequireRoot(), ver routes.go) — a antiga visibilidade por time
// (domain/policy.AuditAccess) foi removida quando essa restrição entrou em vigor, a pedido do
// usuário, depois que admin/user viam o audit trail geral quando deveriam ver só a Activity tab
// de cada aplicação.
func (uc *AuditUseCase) List(ctx context.Context, opts AuditListOptions, cursor *repository.AuditLogCursor, limit int) ([]*entity.AuditLog, error) {
	logs, err := uc.repo.List(ctx, repository.AuditLogFilter{
		Category:     opts.Category,
		ActorID:      opts.ActorID,
		CreatedAfter: opts.CreatedAfter,
		Cursor:       cursor,
		Limit:        clampAuditLimit(limit),
	})
	if err != nil {
		return nil, entity.NewAppError(entity.ErrCodeDatabase, "error fetching audit log")
	}
	return logs, nil
}

// ListForApplication devolve uma página do audit trail de UMA aplicação (a Activity tab, v2.6
// §7) — sem `caller` nenhum e sem passar por AuditAccess de propósito: qualquer usuário
// autenticado pode ver a atividade de uma aplicação, a mesma postura de acesso já usada por GET
// /applications/:id (nenhuma checagem de time por trás dela hoje). Aceita o mesmo
// AuditListOptions de List (categoria + intervalo, confirmados também na ActivityView real depois
// que o design-graph passou a extrair esse componente) — só `opts.ActorID` nunca é usado aqui de
// propósito: a Activity nunca ofereceu um filtro de ator na UI confirmada.
func (uc *AuditUseCase) ListForApplication(ctx context.Context, applicationID string, opts AuditListOptions, cursor *repository.AuditLogCursor, limit int) ([]*entity.AuditLog, error) {
	logs, err := uc.repo.List(ctx, repository.AuditLogFilter{
		ApplicationID: applicationID,
		Category:      opts.Category,
		CreatedAfter:  opts.CreatedAfter,
		Cursor:        cursor,
		Limit:         clampAuditLimit(limit),
	})
	if err != nil {
		return nil, entity.NewAppError(entity.ErrCodeDatabase, "error fetching application audit log")
	}
	return logs, nil
}

// ListActors devolve TODOS os autores distintos (root-only, mesmo motivo de List) — alimenta o
// `<select>` de filtro por ator do AuditToolbar (sempre relativo a History, nunca a uma aplicação
// só).
func (uc *AuditUseCase) ListActors(ctx context.Context) ([]repository.AuditActor, error) {
	actors, err := uc.repo.ListActors(ctx)
	if err != nil {
		return nil, entity.NewAppError(entity.ErrCodeDatabase, "error fetching audit actors")
	}
	return actors, nil
}
