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
	}
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

	// Aplicar mudanças
	if err := settings.ApplyUpdate(req); err != nil {
		return nil, err
	}

	// Salvar
	if err := uc.approvalSettingsRepo.Update(ctx, settings); err != nil {
		return nil, err
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

	// Criar solicitação
	request, err := entity.NewApprovalRequest(actionType, description, requestedBy, teamID, applicationID, toggleID, actionData)
	if err != nil {
		return nil, err
	}

	// Salvar no banco
	if err := uc.approvalRequestRepo.Create(ctx, request); err != nil {
		return nil, err
	}

	return request, nil
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

	return uc.approvalRequestRepo.Update(ctx, request)
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

	return uc.approvalRequestRepo.Update(ctx, request)
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

	switch request.ActionType {
	case entity.ApprovalActionToggleCreate:
		// Executar criação de toggle
		return uc.executeToggleCreateAction(ctx, request)
	case entity.ApprovalActionToggleUpdate:
		// Executar atualização de toggle
		return uc.executeToggleUpdateAction(ctx, request)
	case entity.ApprovalActionToggleDelete:
		// Executar exclusão de toggle
		return uc.executeToggleDeleteAction(ctx, request)
	case entity.ApprovalActionToggleEnable:
		// Executar ativação de toggle (same as update)
		return uc.executeToggleUpdateAction(ctx, request)
	case entity.ApprovalActionToggleDisable:
		// Executar desativação de toggle (same as update)
		return uc.executeToggleUpdateAction(ctx, request)
	case entity.ApprovalActionToggleRule:
		// Executar alteração de regra de toggle (same as update)
		return uc.executeToggleUpdateAction(ctx, request)
	case entity.ApprovalActionApplicationCreate:
		// Não existe application_update (docs/rest-flow.md §9.1) — PUT /applications/:id também
		// cai neste mesmo action_type. ApplicationID só é preenchido pra esse caso (edição);
		// numa criação de verdade a aplicação ainda não existe, então fica nil.
		if request.ApplicationID != nil {
			return uc.executeApplicationUpdateAction(ctx, request)
		}
		return uc.executeApplicationCreateAction(ctx, request)
	case entity.ApprovalActionApplicationDelete:
		// Executar exclusão de aplicação
		return uc.executeApplicationDeleteAction(ctx, request)
	case entity.ApprovalActionSecretKeyCreate:
		// Executar criação de secret key
		return uc.executeSecretKeyCreateAction(ctx, request)
	case entity.ApprovalActionSecretKeyDelete:
		// Executar exclusão de secret key
		return uc.executeSecretKeyDeleteAction(ctx, request)
	default:
		return fmt.Errorf("unsupported action type: %s", request.ActionType)
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
	// Deserializar action data
	var actionData struct {
		ApplicationID   string `json:"application_id"`
		ApplicationName string `json:"application_name"`
		Regenerate      bool   `json:"regenerate"`
	}

	if err := request.GetActionDataAs(&actionData); err != nil {
		return fmt.Errorf("failed to deserialize action data: %w", err)
	}

	// Verificar se a aplicação existe
	if request.ApplicationID == nil {
		return errors.New("application ID is required for secret key creation")
	}

	// Usar SecretKeyUseCase para gerar ou regenerar a chave
	var err error

	if actionData.Regenerate {
		_, err = uc.secretKeyUseCase.RegenerateSecretKey(*request.ApplicationID, request.RequestedBy)
	} else {
		_, err = uc.secretKeyUseCase.CreateSecretKey("API Access Key", *request.ApplicationID, request.RequestedBy)
	}

	if err != nil {
		return fmt.Errorf("failed to create secret key: %w", err)
	}

	// Log da criação bem-sucedida (sem incluir a chave plana por segurança)
	fmt.Printf("Secret key created successfully for application %s by user %s\n",
		*request.ApplicationID, request.RequestedBy)

	// Nota: A chave plana não é retornada aqui pois o usuário não estará presente
	// para copiá-la. Em um sistema real, seria necessário notificar o usuário
	// de alguma forma (email, notificação, etc.)

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
