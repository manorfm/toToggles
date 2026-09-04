package usecase

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/domain/policy"
	"github.com/manorfm/totoogle/internal/app/domain/repository"
)

// ErrApprovalAccessDenied is returned by every access-controlled approval method (act or read)
// when the caller isn't root and isn't the right team relationship for that operation. Handlers
// map it to 403 (act/read-by-team) or 404 (read-by-id, to avoid confirming a foreign request's
// existence) — see approval_handler.go.
var ErrApprovalAccessDenied = errors.New("user does not have access to this team's approval requests")

// approvalAccessPolicy is the exact shape ApprovalUseCase needs from an authorization policy —
// declared here (not in domain/policy) so usecase tests can fake it without a real repository.
// *policy.ApprovalAccess satisfies it structurally.
type approvalAccessPolicy interface {
	CanAct(ctx context.Context, user *entity.User, teamID string) (bool, error)
	CanRead(ctx context.Context, user *entity.User, teamID string) (bool, error)
	VisibleTeamIDs(ctx context.Context, user *entity.User) (teamIDs []string, unrestricted bool, err error)
}

type ApprovalUseCase struct {
	approvalRequestRepo  repository.ApprovalRequestRepository
	approvalSettingsRepo repository.ApprovalSettingsRepository
	teamApproverRepo     repository.TeamApproverRepository
	userRepo             repository.UserRepository
	teamRepo             repository.TeamRepository
	applicationRepo      repository.ApplicationRepository
	toggleRepo           repository.ToggleRepository
	teamUseCase          *TeamUseCase
	toggleUseCase        *ToggleUseCase
	applicationUseCase   *ApplicationUseCase
	secretKeyUseCase     *SecretKeyUseCase
	access               approvalAccessPolicy
	// auditUseCase é opcional (pode ficar nil): testes de acesso/autorização não precisam de
	// auditoria de verdade, e sempre checar nil aqui evita ter que passar um AuditUseCase real
	// (com seus próprios mocks) só pra satisfazer a assinatura em todo teste que não é sobre
	// isso — mesma tolerância a dependência opcional já usada nos outros parâmetros nil deste
	// construtor em testes existentes.
	auditUseCase *AuditUseCase
}

func NewApprovalUseCase(
	approvalRequestRepo repository.ApprovalRequestRepository,
	approvalSettingsRepo repository.ApprovalSettingsRepository,
	teamApproverRepo repository.TeamApproverRepository,
	userRepo repository.UserRepository,
	teamRepo repository.TeamRepository,
	applicationRepo repository.ApplicationRepository,
	toggleRepo repository.ToggleRepository,
	teamUseCase *TeamUseCase,
	toggleUseCase *ToggleUseCase,
	applicationUseCase *ApplicationUseCase,
	secretKeyUseCase *SecretKeyUseCase,
	auditUseCase *AuditUseCase,
) *ApprovalUseCase {
	return &ApprovalUseCase{
		approvalRequestRepo:  approvalRequestRepo,
		approvalSettingsRepo: approvalSettingsRepo,
		teamApproverRepo:     teamApproverRepo,
		userRepo:             userRepo,
		teamRepo:             teamRepo,
		applicationRepo:      applicationRepo,
		toggleRepo:           toggleRepo,
		teamUseCase:          teamUseCase,
		toggleUseCase:        toggleUseCase,
		applicationUseCase:   applicationUseCase,
		secretKeyUseCase:     secretKeyUseCase,
		access:               policy.NewApprovalAccess(teamRepo, teamApproverRepo),
		auditUseCase:         auditUseCase,
	}
}

// recordAudit grava um evento se auditUseCase estiver configurado — nunca panica quando nil
// (testes de autorização passam nil de propósito, ver o comentário no campo).
func (uc *ApprovalUseCase) recordAudit(eventType entity.AuditEventType, text, target string, teamID *string, actor *entity.User) {
	if uc.auditUseCase == nil {
		return
	}
	uc.auditUseCase.Record(eventType, text, target, teamID, actor)
}

// ============================
// Configurações de Aprovação
// ============================

func (uc *ApprovalUseCase) GetApprovalSettings(ctx context.Context) (*entity.ApprovalSettingsResponse, error) {
	settings, err := uc.approvalSettingsRepo.Get(ctx)
	if err != nil {
		return nil, err
	}

	return settings.ToResponse()
}

func (uc *ApprovalUseCase) UpdateApprovalSettings(ctx context.Context, userID string, req *entity.UpdateApprovalSettingsRequest) (*entity.ApprovalSettingsResponse, error) {
	// Verificar se o usuário é root
	user, err := uc.userRepo.GetByID(userID)
	if err != nil {
		return nil, err
	}

	if !user.IsRoot() {
		return nil, errors.New("only root users can modify approval settings")
	}

	// Buscar configurações atuais
	settings, err := uc.approvalSettingsRepo.Get(ctx)
	if err != nil {
		return nil, err
	}
	wasEnabled := settings.ApprovalEnabled

	// Aplicar mudanças
	if err := settings.ApplyUpdate(req); err != nil {
		return nil, err
	}

	// Salvar
	if err := uc.approvalSettingsRepo.Update(ctx, settings); err != nil {
		return nil, err
	}

	// Evento global (team_id nil) — só root chega aqui (checado acima), e nenhum não-root
	// nunca vê uma linha com team_id nil (AuditAccess), então isso já é root-only "de graça".
	if req.ApprovalEnabled != nil && *req.ApprovalEnabled != wasEnabled {
		verb := "disabled"
		if settings.ApprovalEnabled {
			verb = "enabled"
		}
		uc.recordAudit(entity.AuditEventApprovalSystemToggled, "Approval system "+verb, "", nil, user)
	}

	return settings.ToResponse()
}

// ============================
// Solicitações de Aprovação
// ============================

func (uc *ApprovalUseCase) CreateApprovalRequest(ctx context.Context, actionType entity.ApprovalActionType, description string, requestedBy string, teamID string, applicationID *string, toggleID *string, actionData interface{}) (*entity.ApprovalRequest, error) {
	// Verificar se aprovação está habilitada e se esta ação precisa aprovação
	requiresApproval, err := uc.approvalSettingsRepo.RequiresApproval(ctx, actionType)
	if err != nil {
		return nil, err
	}

	if !requiresApproval {
		return nil, errors.New("this action does not require approval")
	}

	// Validar se o usuário existe
	requester, err := uc.userRepo.GetByID(requestedBy)
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}

	// Validar se o team existe
	_, err = uc.teamRepo.GetByID(teamID)
	if err != nil {
		return nil, fmt.Errorf("team not found: %w", err)
	}

	// O requester precisa pertencer ao team em nome do qual está abrindo a solicitação (root
	// isento automaticamente via a mesma policy usada em toda leitura/ação de aprovação).
	canRequest, err := uc.access.CanRead(ctx, requester, teamID)
	if err != nil {
		return nil, err
	}
	if !canRequest {
		return nil, ErrApprovalAccessDenied
	}

	// Validar se application existe (se fornecido)
	if applicationID != nil {
		_, err = uc.applicationRepo.GetByID(*applicationID)
		if err != nil {
			return nil, fmt.Errorf("application not found: %w", err)
		}
	}

	// Validar se toggle existe (se fornecido)
	if toggleID != nil {
		_, err = uc.toggleRepo.GetByID(*toggleID)
		if err != nil {
			return nil, fmt.Errorf("toggle not found: %w", err)
		}
	}

	// secret_key_create: gerar a chave (hash + texto puro) JÁ AQUI, inativa — quem pediu recebe o
	// valor em texto puro nesta resposta (única chance, ninguém mais vai estar presente quando a
	// solicitação for aprovada) e pode configurar o serviço desde já; a chave só autentica de
	// verdade depois de aprovada (ActivateAndRotateSecretKey na execução) ou é apagada
	// fisicamente se rejeitada (ver RejectRequest). O ID da chave pendente viaja dentro de
	// action_data pra a execução/rejeição saberem qual registro tratar.
	var plainSecretKey string
	if actionType == entity.ApprovalActionSecretKeyCreate {
		if applicationID == nil {
			return nil, errors.New("application ID is required for secret key creation")
		}
		pending, err := uc.secretKeyUseCase.CreatePendingSecretKey("API Access Key", *applicationID, requestedBy)
		if err != nil {
			return nil, fmt.Errorf("failed to create pending secret key: %w", err)
		}
		plainSecretKey = pending.PlainTextKey

		dataMap, ok := actionData.(map[string]interface{})
		if !ok {
			dataMap = map[string]interface{}{}
		}
		dataMap["secret_key_id"] = pending.SecretKey.ID
		actionData = dataMap
	}

	// Criar solicitação
	request, err := entity.NewApprovalRequest(actionType, description, requestedBy, teamID, applicationID, toggleID, actionData)
	if err != nil {
		return nil, err
	}
	request.PlainSecretKey = plainSecretKey

	// Salvar no banco
	if err := uc.approvalRequestRepo.Create(ctx, request); err != nil {
		return nil, err
	}

	// Gravado com o SOLICITANTE (requester) como actor, não quem for aprovar depois — sem isso,
	// o audit trail de uma ação que passa por aprovação só mostra "root aprovou X", nunca quem
	// pediu X originalmente (gap real, achado numa auditoria pedida pelo usuário). Confirmado no
	// protótipo real como o type "approval-request" (requestApproval).
	// <b>...</b> em volta da descrição: mesmo tratamento de negrito usado pelo protótipo real em
	// `Aprovou/Rejeitou <b>{action}</b>` — aplicado aqui também pro texto de solicitação, pela
	// mesma razão (destacar o termo-chave da linha).
	teamIDCopy := teamID
	uc.recordAudit(entity.AuditEventApprovalRequested, "Requested: <b>"+description+"</b>", uc.approvalRequestTarget(request), &teamIDCopy, requester)

	return request, nil
}

// approvalRequestTarget resolve o target (linha do meio) dos eventos approval_requested/
// approved/rejected — antes sempre `""`, gap conhecido e deixado de propósito nas fases 6/7 por
// falta de um padrão único. Fechado agora com uma fonte real e inequívoca: o `AUDIT_SEED` do
// protótipo (au5: `target: "home.recommendations"` pro texto "Approved <b>Enable toggle</b>
// request") e o parâmetro `path` que TODO callsite real de `requestApproval(actionKey, desc,
// path, pendingAction)` passa — sempre o path/nome do que está sendo pedido (nunca o nome da
// aplicação, diferente do padrão usado em resolveApprovalExecutionAudit pra depois da execução).
// `middleware/approval.go` foi ajustado pra parar de embutir esse mesmo dado dentro da
// `description` (ex.: "Create toggle: X" virou só "Create toggle") — sem essa mudança o dado
// apareceria duplicado, uma vez no texto (negrito) e outra no target.
func (uc *ApprovalUseCase) approvalRequestTarget(request *entity.ApprovalRequest) string {
	switch request.ActionType {
	case entity.ApprovalActionToggleCreate:
		var data struct {
			Toggle string `json:"toggle"`
		}
		_ = request.GetActionDataAs(&data)
		return data.Toggle

	case entity.ApprovalActionToggleUpdate, entity.ApprovalActionToggleDelete,
		entity.ApprovalActionToggleEnable, entity.ApprovalActionToggleDisable, entity.ApprovalActionToggleRule:
		if request.ToggleID != nil {
			if toggle, err := uc.toggleRepo.GetByID(*request.ToggleID); err == nil {
				return toggle.Path
			}
		}
		return ""

	case entity.ApprovalActionApplicationCreate:
		// Cobre tanto criação (ApplicationID nil, nome vem do corpo) quanto edição (ApplicationID
		// setado — não existe application_update, PUT /applications/:id cai neste mesmo
		// action_type, docs/rest-flow.md §9.1); sem nome no corpo (raro, mas o campo é opcional
		// numa edição que só muda team), cai pro nome atual da aplicação.
		var data struct {
			Name string `json:"name"`
		}
		_ = request.GetActionDataAs(&data)
		if data.Name != "" {
			return data.Name
		}
		fallthrough

	case entity.ApprovalActionApplicationDelete, entity.ApprovalActionSecretKeyCreate, entity.ApprovalActionSecretKeyDelete:
		if request.ApplicationID != nil {
			if app, err := uc.applicationRepo.GetByID(*request.ApplicationID); err == nil {
				return app.Name
			}
		}
		return ""

	default:
		return ""
	}
}

// GetApprovalRequest busca uma solicitação por id. Retorna ErrApprovalAccessDenied quando o
// caller não é root nem membro do team dono da solicitação — o handler mapeia isso pra 404 (não
// 403), pra não confirmar a um estranho que aquele ID existe.
func (uc *ApprovalUseCase) GetApprovalRequest(ctx context.Context, requestID string, caller *entity.User) (*entity.ApprovalRequestWithDetails, error) {
	request, err := uc.approvalRequestRepo.GetWithDetails(ctx, requestID)
	if err != nil {
		return nil, err
	}
	canRead, err := uc.access.CanRead(ctx, caller, request.TeamID)
	if err != nil {
		return nil, err
	}
	if !canRead {
		return nil, ErrApprovalAccessDenied
	}
	return request, nil
}

// GetAllApprovalRequests alimenta a tela de History. Root vê tudo; qualquer outro role só vê as
// solicitações dos teams dos quais é membro.
func (uc *ApprovalUseCase) GetAllApprovalRequests(ctx context.Context, caller *entity.User) ([]*entity.ApprovalRequestWithDetails, error) {
	teamIDs, unrestricted, err := uc.access.VisibleTeamIDs(ctx, caller)
	if err != nil {
		return nil, err
	}
	if unrestricted {
		return uc.approvalRequestRepo.GetAllWithDetails(ctx)
	}
	return uc.approvalRequestRepo.GetByTeamIDsWithDetails(ctx, teamIDs)
}

func (uc *ApprovalUseCase) GetPendingApprovalRequests(ctx context.Context) ([]*entity.ApprovalRequestWithDetails, error) {
	return uc.approvalRequestRepo.GetPendingWithDetails(ctx)
}

// GetApprovalRequestsByTeam lista TODAS as solicitações (qualquer status) de um único team —
// requer que o caller seja membro do team (ou root).
func (uc *ApprovalUseCase) GetApprovalRequestsByTeam(ctx context.Context, teamID string, caller *entity.User) ([]*entity.ApprovalRequestWithDetails, error) {
	canRead, err := uc.access.CanRead(ctx, caller, teamID)
	if err != nil {
		return nil, err
	}
	if !canRead {
		return nil, ErrApprovalAccessDenied
	}
	return uc.approvalRequestRepo.GetByTeamIDsWithDetails(ctx, []string{teamID})
}

func (uc *ApprovalUseCase) GetMyApprovalRequests(ctx context.Context, userID string) ([]*entity.ApprovalRequestWithDetails, error) {
	return uc.approvalRequestRepo.GetByRequesterIDWithDetails(ctx, userID)
}

func (uc *ApprovalUseCase) GetApprovableRequests(ctx context.Context, userID string) ([]*entity.ApprovalRequestWithDetails, error) {
	return uc.approvalRequestRepo.GetApprovableByUserID(ctx, userID)
}

// ============================
// Aprovação/Rejeição
// ============================

func (uc *ApprovalUseCase) ApproveRequest(ctx context.Context, requestID string, approver *entity.User) error {
	request, err := uc.approvalRequestRepo.GetByID(ctx, requestID)
	if err != nil {
		return err
	}

	if !request.CanBeApprovedBy(approver.ID) {
		return errors.New("user cannot approve this request")
	}

	canAct, err := uc.access.CanAct(ctx, approver, request.TeamID)
	if err != nil {
		return err
	}
	if !canAct {
		return errors.New("user is not an approver for this team")
	}

	if err := request.Approve(approver.ID); err != nil {
		return err
	}

	if err := uc.approvalRequestRepo.Update(ctx, request); err != nil {
		return err
	}

	teamID := request.TeamID
	// Sem ":" depois de "Approved" e com o sufixo " request" — confirmado literalmente no
	// AUDIT_SEED real (au5: "Approved <b>Enable toggle</b> request"), diferente do que este texto
	// tinha antes ("Approved: <b>X</b>", sem o sufixo).
	uc.recordAudit(entity.AuditEventApprovalApproved, "Approved <b>"+request.Description+"</b> request", uc.approvalRequestTarget(request), &teamID, approver)
	return nil
}

func (uc *ApprovalUseCase) RejectRequest(ctx context.Context, requestID string, rejector *entity.User, reason string) error {
	request, err := uc.approvalRequestRepo.GetByID(ctx, requestID)
	if err != nil {
		return err
	}

	if !request.CanBeApprovedBy(rejector.ID) {
		return errors.New("user cannot reject this request")
	}

	canAct, err := uc.access.CanAct(ctx, rejector, request.TeamID)
	if err != nil {
		return err
	}
	if !canAct {
		return errors.New("user is not an approver for this team")
	}

	if err := request.Reject(rejector.ID, reason); err != nil {
		return err
	}

	if err := uc.approvalRequestRepo.Update(ctx, request); err != nil {
		return err
	}

	// secret_key_create rejeitada: o registro da chave (criado inativo já na hora da
	// solicitação, ver CreateApprovalRequest) é apagado FISICAMENTE do banco — nunca chegou a
	// ficar válida, então não há razão pra manter o hash em lugar nenhum.
	if request.ActionType == entity.ApprovalActionSecretKeyCreate {
		var actionData struct {
			SecretKeyID string `json:"secret_key_id"`
		}
		if err := request.GetActionDataAs(&actionData); err == nil && actionData.SecretKeyID != "" {
			if err := uc.secretKeyUseCase.DeleteSecretKey(actionData.SecretKeyID); err != nil {
				return fmt.Errorf("failed to delete rejected pending secret key: %w", err)
			}
		}
	}

	teamID := request.TeamID
	// Mesmo padrão de ApproveRequest (sem ":", sufixo " request") — o AUDIT_SEED real só tem um
	// exemplo de "approved", não de "rejected", mas o par Aprovou/Rejeitou sempre compartilhou o
	// mesmo template no protótipo (`${decision === "approved" ? "Aprovou" : "Rejeitou"} <b>...`),
	// então a extensão do sufixo pro caso "rejected" é inferência direta, não um chute solto.
	uc.recordAudit(entity.AuditEventApprovalRejected, "Rejected <b>"+request.Description+"</b> request", uc.approvalRequestTarget(request), &teamID, rejector)
	return nil
}

// WithdrawRequest cancela uma solicitação PRÓPRIA ainda pendente (v2.6 §2.8) — diferente de
// Approve/Reject, aqui quem age precisa SER o solicitante (nem root pode retirar o pedido de
// outra pessoa; a UI só mostra esse botão na aba "Mine", nunca em Pending/Approvable). O request
// é apagado de vez (não vira um novo `ApprovalStatus`, mesma escolha do protótipo real —
// `withdrawApproval` remove do array em vez de marcar um status "withdrawn").
func (uc *ApprovalUseCase) WithdrawRequest(ctx context.Context, requestID string, requester *entity.User) error {
	request, err := uc.approvalRequestRepo.GetByID(ctx, requestID)
	if err != nil {
		return err
	}

	if request.RequestedBy != requester.ID {
		return errors.New("only the requester can withdraw this request")
	}

	if request.Status != entity.ApprovalStatusPending {
		return errors.New("approval request is not pending")
	}

	// secret_key_create retirado: mesma limpeza de RejectRequest — a chave pendente (criada
	// inativa já na hora da solicitação) nunca chegou a ficar válida, então o registro é apagado
	// fisicamente em vez de ficar órfão no banco.
	if request.ActionType == entity.ApprovalActionSecretKeyCreate {
		var actionData struct {
			SecretKeyID string `json:"secret_key_id"`
		}
		if err := request.GetActionDataAs(&actionData); err == nil && actionData.SecretKeyID != "" {
			if err := uc.secretKeyUseCase.DeleteSecretKey(actionData.SecretKeyID); err != nil {
				return fmt.Errorf("failed to delete withdrawn pending secret key: %w", err)
			}
		}
	}

	if err := uc.approvalRequestRepo.Delete(ctx, requestID); err != nil {
		return err
	}

	teamID := request.TeamID
	uc.recordAudit(entity.AuditEventApprovalWithdrawn, "Withdrew <b>"+request.Description+"</b> request", uc.approvalRequestTarget(request), &teamID, requester)
	return nil
}

// ============================
// Gerenciamento de Aprovadores
// ============================

func (uc *ApprovalUseCase) SetTeamApprover(ctx context.Context, teamID string, userID string, isApprover bool, actionByUserID string) error {
	// Verificar se quem está fazendo a ação pode gerenciar aprovadores
	actionByUser, err := uc.userRepo.GetByID(actionByUserID)
	if err != nil {
		return err
	}

	// Root sempre pode gerenciar approvers
	if !actionByUser.IsRoot() {
		// Admin só pode se o sistema de approval estiver habilitado
		if !actionByUser.IsAdmin() {
			return errors.New("insufficient permissions to manage team approvers")
		}

		// Verificar se approval está habilitado para admins
		settings, err := uc.approvalSettingsRepo.Get(ctx)
		if err != nil {
			return fmt.Errorf("failed to check approval settings: %w", err)
		}

		if !settings.ApprovalEnabled {
			return errors.New("approval system must be enabled for admin users to manage approvers")
		}
	}

	// Verificar se o team existe
	_, err = uc.teamRepo.GetByID(teamID)
	if err != nil {
		return fmt.Errorf("team not found: %w", err)
	}

	// Verificar se o usuário existe e tem permissão para ser aprovador
	user, err := uc.userRepo.GetByID(userID)
	if err != nil {
		return fmt.Errorf("user not found: %w", err)
	}

	// Apenas admin e root podem ser aprovadores
	if isApprover && !user.IsAdmin() && !user.IsRoot() {
		return errors.New("only admin and root users can be set as approvers")
	}

	// Verificar se o usuário faz parte do team
	// Isso deveria ser feito através de um método no team repository

	// Definir como aprovador
	return uc.teamApproverRepo.SetUserAsApprover(ctx, teamID, userID, isApprover)
}

func (uc *ApprovalUseCase) GetTeamApprovers(ctx context.Context, teamID string) ([]*entity.TeamUserWithApprover, error) {
	return uc.teamApproverRepo.GetTeamApprovers(ctx, teamID)
}

func (uc *ApprovalUseCase) GetUserApproverTeams(ctx context.Context, userID string) ([]string, error) {
	return uc.teamApproverRepo.GetUserTeamsAsApprover(ctx, userID)
}

// GetTeamsWithoutApprover lista, dentre os PRÓPRIOS times do usuário, quais não têm nenhum
// aprovador designado — alimenta o aviso "You are not an approver on any of your teams..." da
// tela de Approvals (v2.6 §2.10). Escopado ao chamador por design: `GET /teams/:id/approvers`
// (que devolveria o roster completo) é RequireRoot() no grupo `/teams` inteiro — não dava pra
// reusar sem afrouxar essa autorização pra qualquer membro de time. Aqui só o boolean "tem
// aprovador ou não" escapa, nunca o roster (quem são os membros/aprovadores).
func (uc *ApprovalUseCase) GetTeamsWithoutApprover(ctx context.Context, userID string) ([]*entity.Team, error) {
	teams, err := uc.teamRepo.GetTeamsByUserID(userID)
	if err != nil {
		return nil, err
	}

	var withoutApprover []*entity.Team
	for _, team := range teams {
		approvers, err := uc.teamApproverRepo.GetTeamApprovers(ctx, team.ID)
		if err != nil {
			return nil, err
		}
		hasApprover := false
		for _, a := range approvers {
			if a.IsApprover {
				hasApprover = true
				break
			}
		}
		if !hasApprover {
			withoutApprover = append(withoutApprover, team)
		}
	}
	return withoutApprover, nil
}

// ============================
// Utilidades
// ============================

func (uc *ApprovalUseCase) RequiresApproval(ctx context.Context, actionType entity.ApprovalActionType) (bool, error) {
	return uc.approvalSettingsRepo.RequiresApproval(ctx, actionType)
}

func (uc *ApprovalUseCase) IsApprovalEnabled(ctx context.Context) (bool, error) {
	return uc.approvalSettingsRepo.IsApprovalEnabled(ctx)
}

func (uc *ApprovalUseCase) MarkExpiredRequests(ctx context.Context) error {
	return uc.approvalRequestRepo.MarkExpiredRequests(ctx)
}

// GetApprovalStats agrega estatísticas globais para root, ou escopadas aos próprios teams para
// qualquer outro caller — mesma regra de visibilidade de GetAllApprovalRequests.
func (uc *ApprovalUseCase) GetApprovalStats(ctx context.Context, caller *entity.User) (map[entity.ApprovalStatus]int, error) {
	teamIDs, unrestricted, err := uc.access.VisibleTeamIDs(ctx, caller)
	if err != nil {
		return nil, err
	}
	if unrestricted {
		return uc.approvalRequestRepo.GetRequestStats(ctx, nil)
	}
	return uc.approvalRequestRepo.GetRequestStats(ctx, teamIDs)
}

// GetApprovalStatsByTeam requer que o caller seja membro do team (ou root).
func (uc *ApprovalUseCase) GetApprovalStatsByTeam(ctx context.Context, teamID string, caller *entity.User) (map[entity.ApprovalStatus]int, error) {
	canRead, err := uc.access.CanRead(ctx, caller, teamID)
	if err != nil {
		return nil, err
	}
	if !canRead {
		return nil, ErrApprovalAccessDenied
	}
	return uc.approvalRequestRepo.GetRequestStats(ctx, []string{teamID})
}

// ============================
// Executar Ação Aprovada
// ============================

func (uc *ApprovalUseCase) ExecuteApprovedAction(ctx context.Context, requestID string, caller *entity.User) error {
	// Buscar a solicitação
	request, err := uc.approvalRequestRepo.GetByID(ctx, requestID)
	if err != nil {
		return err
	}

	// Mesma regra de quem pode agir sobre o request que approve/reject já aplicam — executar é
	// parte da mesma ação de aprovação, não deveria ter um portão mais fraco (era o bug real:
	// esse método não tinha NENHUM check antes).
	canAct, err := uc.access.CanAct(ctx, caller, request.TeamID)
	if err != nil {
		return err
	}
	if !canAct {
		return ErrApprovalAccessDenied
	}

	// Verificar se está aprovada
	if request.Status != entity.ApprovalStatusApproved {
		return errors.New("request is not approved")
	}

	// Aqui seria onde executaríamos a ação original
	// Isso dependerá da integração com os outros use cases
	// Por enquanto, apenas marcamos como processada (se necessário)

	// Não existe application_update (docs/rest-flow.md §9.1) — PUT /applications/:id também cai
	// neste mesmo action_type. ApplicationID só é preenchido pra esse caso (edição); numa criação
	// de verdade a aplicação ainda não existe, então fica nil.
	isApplicationEdit := request.ActionType == entity.ApprovalActionApplicationCreate && request.ApplicationID != nil

	// Resolvido ANTES de executar a ação: toggle_delete/application_delete apagam a entidade que
	// este texto/target descrevem, então buscar o nome/path DEPOIS da execução seria tarde demais
	// (mesmo cuidado já tomado nos handlers diretos — ver toggle_handler.go/application_handler.go).
	eventType, auditText, auditTarget := uc.resolveApprovalExecutionAudit(request, isApplicationEdit)

	var execErr error

	switch request.ActionType {
	case entity.ApprovalActionToggleCreate:
		execErr = uc.executeToggleCreateAction(ctx, request)
	case entity.ApprovalActionToggleUpdate:
		execErr = uc.executeToggleUpdateAction(ctx, request)
	case entity.ApprovalActionToggleDelete:
		execErr = uc.executeToggleDeleteAction(ctx, request)
	case entity.ApprovalActionToggleEnable:
		execErr = uc.executeToggleUpdateAction(ctx, request)
	case entity.ApprovalActionToggleDisable:
		execErr = uc.executeToggleUpdateAction(ctx, request)
	case entity.ApprovalActionToggleRule:
		execErr = uc.executeToggleUpdateAction(ctx, request)
	case entity.ApprovalActionApplicationCreate:
		if isApplicationEdit {
			execErr = uc.executeApplicationUpdateAction(ctx, request)
		} else {
			execErr = uc.executeApplicationCreateAction(ctx, request)
		}
	case entity.ApprovalActionApplicationDelete:
		execErr = uc.executeApplicationDeleteAction(ctx, request)
	case entity.ApprovalActionSecretKeyCreate:
		execErr = uc.executeSecretKeyCreateAction(ctx, request)
	case entity.ApprovalActionSecretKeyDelete:
		execErr = uc.executeSecretKeyDeleteAction(ctx, request)
	default:
		return fmt.Errorf("unsupported action type: %s", request.ActionType)
	}

	if execErr != nil {
		return execErr
	}

	// Evento de domínio da ação que ACABOU de rodar de verdade — sem isso, o audit trail de uma
	// ação que passou pelo workflow de aprovação só teria o "Approved: X" (ApproveRequest), nunca
	// o "X aconteceu" em si; gap real encontrado numa auditoria pedida pelo usuário, comparando o
	// History ao vivo (tudo aparecia como "root", porque só a aprovação era gravada — quem
	// REQUISITOU a ação, o dado que mais importa aqui, nunca tinha entrada nenhuma). actor é
	// `caller` (quem chamou .../execute agora, tipicamente o aprovador) — mesma escolha do
	// protótipo real (executePendingAction sempre usa currentUser, nunca o requester original).
	if eventType != "" {
		teamID := request.TeamID
		uc.recordAudit(eventType, auditText, auditTarget, &teamID, caller)
	}

	return nil
}

// resolveApprovalExecutionAudit decide o AuditEventType, o texto (com o marcador <b> real que
// lib/auditEvents.tsx#renderAuditText reconhece) e o target do evento de execução — chamado
// ANTES do switch que roda a ação em ApproveRequest, acima (ver comentário lá).
//
// Antes esta função reaproveitava request.Description (o texto do "Requested: X", ex. "Create
// toggle: payments.card.x") verbatim + " (after approval)" — nunca tinha negrito e nunca tinha
// target, o gap real por trás do History mostrar 2 linhas em vez de 3 pra qualquer ação que
// passou por aprovação. Reconstruído por tipo de ação e confirmado contra o protótipo real
// (app.jsx#executePendingAction): toggleEnable/deleteToggle/createToggle todos fazem logAudit
// com target = SÓ o nome da aplicação (nunca "{app} · {path}" como as ações diretas
// equivalentes), e deleteApp não passa target nenhum — 2 linhas ali é o render correto, não um
// gap. Rule-set, application-create e secret-key não têm case nenhum em executePendingAction (o
// protótipo real nunca de fato executa essas aprovações) — sem fonte real pra confirmar, o
// target cai pro mesmo identificador que a ação direta equivalente usa.
func (uc *ApprovalUseCase) resolveApprovalExecutionAudit(request *entity.ApprovalRequest, isApplicationEdit bool) (entity.AuditEventType, string, string) {
	const suffix = " (after approval)"

	appName := ""
	if request.ApplicationID != nil {
		if app, err := uc.applicationRepo.GetByID(*request.ApplicationID); err == nil {
			appName = app.Name
		}
	}
	teamName := ""
	if team, err := uc.teamRepo.GetByID(request.TeamID); err == nil {
		teamName = team.Name
	}
	togglePath := ""
	if request.ToggleID != nil {
		if toggle, err := uc.toggleRepo.GetByID(*request.ToggleID); err == nil {
			togglePath = toggle.Path
		}
	}

	switch request.ActionType {
	case entity.ApprovalActionToggleCreate:
		var data struct {
			Toggle string `json:"toggle"`
		}
		_ = request.GetActionDataAs(&data)
		return entity.AuditEventToggleCreated, "Created toggle <b>" + data.Toggle + "</b>" + suffix, appName

	case entity.ApprovalActionToggleDelete:
		return entity.AuditEventToggleDeleted, "Deleted toggle <b>" + togglePath + "</b>" + suffix, appName

	case entity.ApprovalActionToggleEnable:
		return entity.AuditEventToggleEnabled, "Enabled <b>" + togglePath + "</b>" + suffix, appName

	case entity.ApprovalActionToggleDisable:
		return entity.AuditEventToggleDisabled, "Disabled <b>" + togglePath + "</b>" + suffix, appName

	case entity.ApprovalActionToggleUpdate:
		// Endpoint plural sem regra (só `enabled` no corpo) — mesma heurística de
		// middleware/approval.go#getActionType, aqui só pra escolher o verbo certo.
		var data struct {
			Enabled bool `json:"enabled"`
		}
		_ = request.GetActionDataAs(&data)
		if data.Enabled {
			return entity.AuditEventToggleEnabled, "Enabled <b>" + togglePath + "</b>" + suffix, appName
		}
		return entity.AuditEventToggleDisabled, "Disabled <b>" + togglePath + "</b>" + suffix, appName

	case entity.ApprovalActionToggleRule:
		var data struct {
			HasActivationRule bool                   `json:"has_activation_rule"`
			ActivationRule    *entity.ActivationRule `json:"activation_rule"`
		}
		_ = request.GetActionDataAs(&data)
		if data.HasActivationRule && data.ActivationRule != nil {
			// Mesmo texto de toggle_handler.go#UpdateToggle: "Set <b>{type}</b> rule", só com
			// sufixo " to <b>{value}%</b>" pro tipo percentage. Target = só o path, igual ao
			// handler direto (não "{app} · {path}") — decisão já tomada nessa mesma rodada pro
			// evento direto, seguida aqui por consistência.
			text := "Set <b>" + string(data.ActivationRule.Type) + "</b> rule"
			if data.ActivationRule.Type == entity.ActivationRuleTypePercentage {
				text += " to <b>" + data.ActivationRule.Value + "%</b>"
			}
			return entity.AuditEventToggleRuleSet, text + suffix, togglePath
		}
		verb, eventType := "Disabled", entity.AuditEventToggleDisabled
		if data.HasActivationRule {
			verb, eventType = "Enabled", entity.AuditEventToggleEnabled
		}
		return eventType, verb + " <b>" + togglePath + "</b>" + suffix, appName

	case entity.ApprovalActionApplicationCreate:
		if isApplicationEdit {
			return entity.AuditEventApplicationUpdated, "Updated application <b>" + appName + "</b>" + suffix, appName
		}
		var data struct {
			Name string `json:"name"`
		}
		_ = request.GetActionDataAs(&data)
		return entity.AuditEventApplicationCreated, "Created application <b>" + data.Name + "</b>" + suffix, teamName + " team"

	case entity.ApprovalActionApplicationDelete:
		// Confirmado no protótipo real: o pendingAction de deleteApp não passa target nenhum —
		// 2 linhas é o render correto pra este evento específico, não um gap a corrigir.
		return entity.AuditEventApplicationDeleted, "Deleted application <b>" + appName + "</b>" + suffix, ""

	case entity.ApprovalActionSecretKeyCreate:
		return entity.AuditEventKeyGenerated, "Generated service key" + suffix, appName

	case entity.ApprovalActionSecretKeyDelete:
		return entity.AuditEventKeyRevoked, "Service key revoked" + suffix, appName

	default:
		return "", "", ""
	}
}

// Métodos auxiliares para executar ações específicas
// Estes métodos precisarão ser implementados com base nos outros use cases

func (uc *ApprovalUseCase) executeToggleCreateAction(ctx context.Context, request *entity.ApprovalRequest) error {
	// Deserializar action data
	var actionData struct {
		Toggle string `json:"toggle"`
	}

	if err := request.GetActionDataAs(&actionData); err != nil {
		return fmt.Errorf("failed to deserialize action data: %w", err)
	}

	if actionData.Toggle == "" {
		return errors.New("toggle path is required")
	}

	// Verificar se a aplicação existe
	if request.ApplicationID == nil {
		return errors.New("application ID is required for toggle creation")
	}

	// Usar o ToggleUseCase para criar o toggle com lógica de hierarquia
	// Definir valores padrão: disabled (false) e editável (true)
	err := uc.toggleUseCase.CreateToggle(actionData.Toggle, false, true, *request.ApplicationID)
	if err != nil {
		return fmt.Errorf("failed to create toggle hierarchy: %w", err)
	}

	return nil
}

func (uc *ApprovalUseCase) executeToggleUpdateAction(ctx context.Context, request *entity.ApprovalRequest) error {
	// Deserializar action data
	var actionData struct {
		Enabled           bool                   `json:"enabled"`
		HasActivationRule bool                   `json:"has_activation_rule"`
		ActivationRule    *entity.ActivationRule `json:"activation_rule"`
	}

	if err := request.GetActionDataAs(&actionData); err != nil {
		return fmt.Errorf("failed to deserialize action data: %w", err)
	}

	// Verificar se o toggle existe
	if request.ToggleID == nil {
		return errors.New("toggle ID is required for toggle update")
	}

	if request.ApplicationID == nil {
		return errors.New("application ID is required for toggle update")
	}

	// Usar o ToggleUseCase para atualizar o toggle com lógica apropriada
	_, err := uc.toggleUseCase.UpdateToggleWithRule(
		*request.ToggleID,
		actionData.Enabled,
		actionData.HasActivationRule,
		actionData.ActivationRule,
		*request.ApplicationID,
	)
	if err != nil {
		return fmt.Errorf("failed to update toggle: %w", err)
	}

	return nil
}

func (uc *ApprovalUseCase) executeToggleDeleteAction(ctx context.Context, request *entity.ApprovalRequest) error {
	// Verificar se o toggle existe
	if request.ToggleID == nil {
		return errors.New("toggle ID is required for toggle deletion")
	}

	if request.ApplicationID == nil {
		return errors.New("application ID is required for toggle deletion")
	}

	// Usar o ToggleUseCase para deletar o toggle com lógica apropriada
	err := uc.toggleUseCase.DeleteToggleByID(*request.ToggleID, *request.ApplicationID)
	if err != nil {
		return fmt.Errorf("failed to delete toggle: %w", err)
	}

	return nil
}

func (uc *ApprovalUseCase) executeApplicationCreateAction(ctx context.Context, request *entity.ApprovalRequest) error {
	// Deserializar action data
	var actionData struct {
		Name   string `json:"name"`
		TeamID string `json:"team_id"`
	}

	if err := request.GetActionDataAs(&actionData); err != nil {
		return fmt.Errorf("failed to deserialize action data: %w", err)
	}

	if actionData.Name == "" {
		return errors.New("application name is required")
	}

	if actionData.TeamID == "" {
		return errors.New("team ID is required")
	}

	// Verificar se o team existe
	_, err := uc.teamRepo.GetByID(actionData.TeamID)
	if err != nil {
		return fmt.Errorf("failed to get team: %w", err)
	}

	// Criar a aplicação
	app := entity.NewApplication(actionData.Name)
	app.CreatedAt = time.Now()
	app.UpdatedAt = time.Now()

	if err := uc.applicationRepo.Create(app); err != nil {
		return fmt.Errorf("failed to create application: %w", err)
	}

	// Associar aplicação ao team com permissão admin por padrão
	// O usuário que criou a aplicação deve ter permissão total sobre ela
	if err := uc.teamUseCase.AddApplicationToTeam(actionData.TeamID, app.ID, entity.PermissionAdmin); err != nil {
		return fmt.Errorf("failed to associate application with team: %w", err)
	}

	return nil
}

// executeApplicationUpdateAction aplica uma edição de aplicação aprovada (PUT /applications/:id,
// mesmo action_type de criação — ver comentário no dispatch acima). Espelha exatamente o que
// ApplicationHandler.UpdateApplication já faz fora do fluxo de aprovação: nome via
// ApplicationUseCase.UpdateApplication, e, se um team_id novo veio no corpo, move a aplicação
// pra esse team (remove de todos os times atuais, associa ao novo com permissão admin).
func (uc *ApprovalUseCase) executeApplicationUpdateAction(ctx context.Context, request *entity.ApprovalRequest) error {
	if request.ApplicationID == nil {
		return errors.New("application ID is required for application update")
	}

	var actionData struct {
		Name   string `json:"name"`
		TeamID string `json:"team_id"`
	}
	if err := request.GetActionDataAs(&actionData); err != nil {
		return fmt.Errorf("failed to deserialize action data: %w", err)
	}

	if actionData.Name != "" {
		if _, err := uc.applicationUseCase.UpdateApplication(*request.ApplicationID, actionData.Name); err != nil {
			return fmt.Errorf("failed to update application: %w", err)
		}
	}

	if actionData.TeamID != "" {
		if err := uc.teamUseCase.RemoveApplicationFromAllTeams(*request.ApplicationID); err != nil {
			return fmt.Errorf("failed to remove application from current teams: %w", err)
		}
		if err := uc.teamUseCase.AddApplicationToTeam(actionData.TeamID, *request.ApplicationID, entity.PermissionAdmin); err != nil {
			return fmt.Errorf("failed to associate application with new team: %w", err)
		}
	}

	return nil
}

func (uc *ApprovalUseCase) executeApplicationDeleteAction(ctx context.Context, request *entity.ApprovalRequest) error {
	// Verificar se a aplicação existe
	if request.ApplicationID == nil {
		return errors.New("application ID is required for application deletion")
	}

	// Usar ApplicationUseCase.DeleteApplication que já implementa a exclusão em cascata
	if err := uc.applicationUseCase.DeleteApplication(*request.ApplicationID); err != nil {
		return fmt.Errorf("failed to delete application with cascade: %w", err)
	}

	return nil
}

func (uc *ApprovalUseCase) executeSecretKeyCreateAction(ctx context.Context, request *entity.ApprovalRequest) error {
	// A chave já foi criada (inativa) na hora da solicitação, ver CreateApprovalRequest — o valor
	// em texto puro já foi entregue a quem pediu naquele momento. Executar esta ação só ATIVA o
	// registro pendente e apaga qualquer outra chave da aplicação (uma app tem no máximo uma
	// chave ativa por vez); nunca gera uma chave nova aqui, pois ninguém estaria presente pra
	// copiá-la.
	var actionData struct {
		ApplicationID string `json:"application_id"`
		SecretKeyID   string `json:"secret_key_id"`
	}

	if err := request.GetActionDataAs(&actionData); err != nil {
		return fmt.Errorf("failed to deserialize action data: %w", err)
	}

	if request.ApplicationID == nil {
		return errors.New("application ID is required for secret key creation")
	}
	if actionData.SecretKeyID == "" {
		return errors.New("pending secret key not found for this request")
	}

	if err := uc.secretKeyUseCase.ActivateAndRotateSecretKey(actionData.SecretKeyID, *request.ApplicationID); err != nil {
		return fmt.Errorf("failed to activate secret key: %w", err)
	}

	return nil
}

func (uc *ApprovalUseCase) executeSecretKeyDeleteAction(ctx context.Context, request *entity.ApprovalRequest) error {
	// Deserializar action data
	var actionData struct {
		SecretKeyID string `json:"secret_key_id"`
	}

	if err := request.GetActionDataAs(&actionData); err != nil {
		return fmt.Errorf("failed to deserialize action data: %w", err)
	}

	if actionData.SecretKeyID == "" {
		return errors.New("secret key ID is required for secret key deletion")
	}

	// Usar SecretKeyUseCase para deletar a chave
	if err := uc.secretKeyUseCase.DeleteSecretKey(actionData.SecretKeyID); err != nil {
		return fmt.Errorf("failed to delete secret key: %w", err)
	}

	return nil
}

// GetApplicationIDForSecretKey resolve a aplicação dona de uma secret key — usado pelo middleware
// de aprovação para escopar por team a exclusão de uma chave (a URL de DELETE só carrega o ID da
// chave, não o da aplicação).
func (uc *ApprovalUseCase) GetApplicationIDForSecretKey(secretKeyID string) (string, error) {
	key, err := uc.secretKeyUseCase.GetSecretKeyByID(secretKeyID)
	if err != nil {
		return "", err
	}
	return key.ApplicationID, nil
}

// GetUserTeamForApplication obtém o primeiro team do usuário que tem acesso à aplicação específica
func (uc *ApprovalUseCase) GetUserTeamForApplication(ctx context.Context, userID string, applicationID string) (string, error) {
	// Buscar teams do usuário
	userTeams, err := uc.teamRepo.GetTeamsByUserID(userID)
	if err != nil {
		return "", err
	}

	if len(userTeams) == 0 {
		return "", errors.New("user has no teams assigned")
	}

	// Se tem aplicação específica, verificar qual team tem acesso a ela
	if applicationID != "" {
		for _, team := range userTeams {
			// Verificar se este team tem acesso à aplicação
			teamApps, err := uc.teamRepo.GetApplicationsByTeamID(team.ID)
			if err != nil {
				continue // Ignorar erros e tentar próximo team
			}

			// Verificar se a aplicação está na lista
			for _, app := range teamApps {
				if app.ID == applicationID {
					return team.ID, nil
				}
			}
		}
	}

	// Se não encontrou team específico com acesso à aplicação, retornar o primeiro team
	return userTeams[0].ID, nil
}
