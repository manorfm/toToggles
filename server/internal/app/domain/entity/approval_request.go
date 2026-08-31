package entity

import (
	"encoding/json"
	"errors"
	"time"

	"gorm.io/gorm"
)

// ApprovalActionType define os tipos de ações que podem precisar aprovação
type ApprovalActionType string

const (
	ApprovalActionToggleCreate      ApprovalActionType = "toggle_create"
	ApprovalActionToggleUpdate      ApprovalActionType = "toggle_update"
	ApprovalActionToggleDelete      ApprovalActionType = "toggle_delete"
	ApprovalActionToggleEnable      ApprovalActionType = "toggle_enable"
	ApprovalActionToggleDisable     ApprovalActionType = "toggle_disable"
	ApprovalActionToggleRule        ApprovalActionType = "toggle_rule"
	ApprovalActionApplicationCreate ApprovalActionType = "application_create"
	ApprovalActionApplicationDelete ApprovalActionType = "application_delete"
	ApprovalActionSecretKeyCreate   ApprovalActionType = "secret_key_create"
	ApprovalActionSecretKeyDelete   ApprovalActionType = "secret_key_delete"
)

// ApprovalStatus define os status de uma solicitação de aprovação
type ApprovalStatus string

const (
	ApprovalStatusPending  ApprovalStatus = "pending"
	ApprovalStatusApproved ApprovalStatus = "approved"
	ApprovalStatusRejected ApprovalStatus = "rejected"
	ApprovalStatusExpired  ApprovalStatus = "expired"
)

// ApprovalRequest representa uma solicitação de aprovação
type ApprovalRequest struct {
	ID              string             `json:"id" gorm:"primaryKey;type:varchar(26)"`
	ActionType      ApprovalActionType `json:"action_type" gorm:"not null;type:varchar(50)"`
	Description     string             `json:"description" gorm:"type:varchar(500)"`
	RequestedBy     string             `json:"requested_by" gorm:"not null;type:varchar(26)"` // User ID
	TeamID          string             `json:"team_id" gorm:"not null;type:varchar(26)"`
	ApplicationID   *string            `json:"application_id" gorm:"type:varchar(26)"` // Pode ser null para ações gerais
	ToggleID        *string            `json:"toggle_id" gorm:"type:varchar(26)"`      // Pode ser null para ações de aplicação
	Status          ApprovalStatus     `json:"status" gorm:"not null;type:varchar(20);default:'pending'"`
	ActionData      json.RawMessage    `json:"action_data" gorm:"type:text"`        // Dados da ação original em JSON
	ActionedBy      *string            `json:"actioned_by" gorm:"type:varchar(26)"` // User ID de quem aprovou/rejeitou
	ActionedAt      *time.Time         `json:"actioned_at"`                         // Data da aprovação/rejeição
	RejectionReason *string            `json:"rejection_reason" gorm:"type:varchar(500)"`
	ExpiresAt       time.Time          `json:"expires_at" gorm:"not null"` // Expira automaticamente
	CreatedAt       time.Time          `json:"created_at"`
	UpdatedAt       time.Time          `json:"updated_at"`

	// Relacionamentos
	Requester    *User        `json:"requester,omitempty" gorm:"foreignKey:RequestedBy"`
	Team         *Team        `json:"team,omitempty" gorm:"foreignKey:TeamID"`
	Application  *Application `json:"application,omitempty" gorm:"foreignKey:ApplicationID"`
	Toggle       *Toggle      `json:"toggle,omitempty" gorm:"foreignKey:ToggleID"`
	ActionedUser *User        `json:"actioned_user,omitempty" gorm:"foreignKey:ActionedBy"`

	// PlainSecretKey é transiente (gorm:"-", nunca persistido) — só populado em memória pelo
	// retorno de ApprovalUseCase.CreateApprovalRequest quando ActionType é secret_key_create, pra
	// que o handler HTTP possa devolver a chave em texto puro a quem acabou de pedi-la (única
	// oportunidade de vê-la: ninguém mais vai estar presente quando a solicitação for aprovada).
	PlainSecretKey string `json:"-" gorm:"-"`
}

// BeforeCreate hook para gerar ID único
func (ar *ApprovalRequest) BeforeCreate(tx *gorm.DB) error {
	if ar.ID == "" {
		ar.ID = generateULID()
	}
	return nil
}

// NewApprovalRequest cria uma nova solicitação de aprovação
func NewApprovalRequest(actionType ApprovalActionType, description string, requestedBy string, teamID string, applicationID *string, toggleID *string, actionData interface{}) (*ApprovalRequest, error) {
	// Serializar dados da ação
	actionDataBytes, err := json.Marshal(actionData)
	if err != nil {
		return nil, err
	}

	// Definir expiração (7 dias por padrão)
	expiresAt := time.Now().Add(7 * 24 * time.Hour)

	return &ApprovalRequest{
		ID:            generateULID(),
		ActionType:    actionType,
		Description:   description,
		RequestedBy:   requestedBy,
		TeamID:        teamID,
		ApplicationID: applicationID,
		ToggleID:      toggleID,
		Status:        ApprovalStatusPending,
		ActionData:    actionDataBytes,
		ExpiresAt:     expiresAt,
	}, nil
}

// Approve aprova a solicitação
func (ar *ApprovalRequest) Approve(approverID string) error {
	if ar.Status != ApprovalStatusPending {
		return errors.New("approval request is not pending")
	}

	if ar.IsExpired() {
		return errors.New("approval request has expired")
	}

	now := time.Now()
	ar.Status = ApprovalStatusApproved
	ar.ActionedBy = &approverID
	ar.ActionedAt = &now

	return nil
}

// Reject rejeita a solicitação
func (ar *ApprovalRequest) Reject(rejectorID string, reason string) error {
	if ar.Status != ApprovalStatusPending {
		return errors.New("approval request is not pending")
	}

	if ar.IsExpired() {
		return errors.New("approval request has expired")
	}

	now := time.Now()
	ar.Status = ApprovalStatusRejected
	ar.ActionedBy = &rejectorID
	ar.ActionedAt = &now
	if reason != "" {
		ar.RejectionReason = &reason
	}

	return nil
}

// IsExpired verifica se a solicitação expirou
func (ar *ApprovalRequest) IsExpired() bool {
	return time.Now().After(ar.ExpiresAt)
}

// MarkAsExpired marca como expirada
func (ar *ApprovalRequest) MarkAsExpired() {
	if ar.Status == ApprovalStatusPending && ar.IsExpired() {
		ar.Status = ApprovalStatusExpired
	}
}

// CanBeApprovedBy verifica se o usuário pode aprovar esta solicitação
func (ar *ApprovalRequest) CanBeApprovedBy(userID string) bool {
	// Não pode aprovar sua própria solicitação
	if ar.RequestedBy == userID {
		return false
	}

	// Deve estar pendente
	if ar.Status != ApprovalStatusPending {
		return false
	}

	// Não deve estar expirada
	if ar.IsExpired() {
		return false
	}

	return true
}

// GetActionDataAs deserializa os dados da ação para a struct especificada
func (ar *ApprovalRequest) GetActionDataAs(target interface{}) error {
	return json.Unmarshal(ar.ActionData, target)
}

// Validate valida os dados da solicitação
func (ar *ApprovalRequest) Validate() error {
	if ar.RequestedBy == "" {
		return errors.New("requested_by is required")
	}

	if ar.TeamID == "" {
		return errors.New("team_id is required")
	}

	if ar.ActionType == "" {
		return errors.New("action_type is required")
	}

	// Validar tipos de ação
	validActionTypes := map[ApprovalActionType]bool{
		ApprovalActionToggleCreate:      true,
		ApprovalActionToggleUpdate:      true,
		ApprovalActionToggleDelete:      true,
		ApprovalActionToggleEnable:      true,
		ApprovalActionToggleDisable:     true,
		ApprovalActionToggleRule:        true,
		ApprovalActionApplicationCreate: true,
		ApprovalActionApplicationDelete: true,
		ApprovalActionSecretKeyCreate:   true,
		ApprovalActionSecretKeyDelete:   true,
	}

	if !validActionTypes[ar.ActionType] {
		return errors.New("invalid action_type")
	}

	// Validar se ações de toggle têm toggle_id ou application_id quando necessário
	toggleActions := []ApprovalActionType{
		ApprovalActionToggleCreate,
		ApprovalActionToggleUpdate,
		ApprovalActionToggleDelete,
		ApprovalActionToggleEnable,
		ApprovalActionToggleDisable,
		ApprovalActionToggleRule,
	}

	for _, toggleAction := range toggleActions {
		if ar.ActionType == toggleAction && ar.ApplicationID == nil {
			return errors.New("application_id is required for toggle actions")
		}
	}

	return nil
}

// ApprovalRequestWithDetails representa uma solicitação com detalhes carregados
type ApprovalRequestWithDetails struct {
	*ApprovalRequest
	RequesterName    string `json:"requester_name"`
	TeamName         string `json:"team_name"`
	ApplicationName  string `json:"application_name,omitempty"`
	TogglePath       string `json:"toggle_path,omitempty"`
	ActionedUserName string `json:"actioned_user_name,omitempty"`
}

// ApprovalStatsResponse representa estatísticas de aprovação
type ApprovalStatsResponse struct {
	TotalRequests   int                    `json:"total_requests"`
	PendingRequests int                    `json:"pending_requests"`
	ApprovedCount   int                    `json:"approved_count"`
	RejectedCount   int                    `json:"rejected_count"`
	ExpiredCount    int                    `json:"expired_count"`
	ByActionType    map[string]int         `json:"by_action_type"`
	ByStatus        map[ApprovalStatus]int `json:"by_status"`
}

// TeamApproverInfo representa informações de aprovador do time
type TeamApproverInfo struct {
	TeamID     string `json:"team_id"`
	TeamName   string `json:"team_name"`
	IsApprover bool   `json:"is_approver"`
	CanApprove bool   `json:"can_approve"`
}

// GetActionTypeDisplayName retorna o nome amigável do tipo de ação
func GetActionTypeDisplayName(actionType ApprovalActionType) string {
	names := map[ApprovalActionType]string{
		ApprovalActionToggleCreate:      "Criar Toggle",
		ApprovalActionToggleUpdate:      "Atualizar Toggle",
		ApprovalActionToggleDelete:      "Excluir Toggle",
		ApprovalActionToggleEnable:      "Habilitar Toggle",
		ApprovalActionToggleDisable:     "Desabilitar Toggle",
		ApprovalActionToggleRule:        "Alterar Regra de Ativação",
		ApprovalActionApplicationCreate: "Criar Aplicação",
		ApprovalActionApplicationDelete: "Excluir Aplicação",
		ApprovalActionSecretKeyCreate:   "Criar Chave Secreta",
		ApprovalActionSecretKeyDelete:   "Excluir Chave Secreta",
	}

	if name, exists := names[actionType]; exists {
		return name
	}
	return string(actionType)
}

// GetStatusDisplayName retorna o nome amigável do status
func GetStatusDisplayName(status ApprovalStatus) string {
	names := map[ApprovalStatus]string{
		ApprovalStatusPending:  "Pendente",
		ApprovalStatusApproved: "Aprovado",
		ApprovalStatusRejected: "Rejeitado",
		ApprovalStatusExpired:  "Expirado",
	}

	if name, exists := names[status]; exists {
		return name
	}
	return string(status)
}
