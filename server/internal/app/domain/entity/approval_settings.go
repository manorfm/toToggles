package entity

import (
	"encoding/json"
	"errors"
	"time"

	"gorm.io/gorm"
)

// ApprovalSettings representa as configurações globais do sistema de aprovação
type ApprovalSettings struct {
	ID                    string          `json:"id" gorm:"primaryKey;type:varchar(26)"`
	ApprovalEnabled       bool            `json:"approval_enabled" gorm:"default:false"` // Root habilita/desabilita o sistema
	RequiredActions       string `json:"required_actions" gorm:"type:text"`     // Quais ações precisam aprovação
	DefaultExpirationDays int             `json:"default_expiration_days" gorm:"default:7"` // Dias para expirar solicitações
	CreatedAt             time.Time       `json:"created_at"`
	UpdatedAt             time.Time       `json:"updated_at"`
}

// ApprovalConfig representa a configuração de quais ações precisam aprovação
type ApprovalConfig struct {
	ToggleCreate      bool `json:"toggle_create"`
	ToggleUpdate      bool `json:"toggle_update"`
	ToggleDelete      bool `json:"toggle_delete"`
	ToggleEnable      bool `json:"toggle_enable"`
	ToggleDisable     bool `json:"toggle_disable"`
	ToggleRule        bool `json:"toggle_rule"`
	ApplicationCreate bool `json:"application_create"`
	ApplicationDelete bool `json:"application_delete"`
	SecretKeyCreate   bool `json:"secret_key_create"`
	SecretKeyDelete   bool `json:"secret_key_delete"`
}

// BeforeCreate hook para gerar ID único
func (as *ApprovalSettings) BeforeCreate(tx *gorm.DB) error {
	if as.ID == "" {
		as.ID = generateULID()
	}
	return nil
}

// NewApprovalSettings cria configurações padrão
func NewApprovalSettings() *ApprovalSettings {
	// Configuração padrão: todas as ações críticas precisam aprovação
	defaultConfig := ApprovalConfig{
		ToggleCreate:      false,
		ToggleUpdate:      false,
		ToggleDelete:      true, // Exclusão sempre crítica
		ToggleEnable:      false,
		ToggleDisable:     false,
		ToggleRule:        true, // Mudança de regras crítica
		ApplicationCreate: true, // Criação de app crítica
		ApplicationDelete: true, // Exclusão de app crítica
		SecretKeyCreate:   true, // Chaves críticas
		SecretKeyDelete:   true, // Exclusão de chaves crítica
	}

	configBytes, _ := json.Marshal(defaultConfig)

	return &ApprovalSettings{
		ID:                    generateULID(),
		ApprovalEnabled:       false, // Desabilitado por padrão
		RequiredActions:       string(configBytes),
		DefaultExpirationDays: 7,
	}
}

// GetRequiredActions retorna a configuração de ações que precisam aprovação
func (as *ApprovalSettings) GetRequiredActions() (*ApprovalConfig, error) {
	var config ApprovalConfig
	if err := json.Unmarshal([]byte(as.RequiredActions), &config); err != nil {
		return nil, err
	}
	return &config, nil
}

// SetRequiredActions define quais ações precisam aprovação
func (as *ApprovalSettings) SetRequiredActions(config *ApprovalConfig) error {
	configBytes, err := json.Marshal(config)
	if err != nil {
		return err
	}
	as.RequiredActions = string(configBytes)
	return nil
}

// RequiresApproval verifica se uma ação específica precisa aprovação
func (as *ApprovalSettings) RequiresApproval(actionType ApprovalActionType) bool {
	if !as.ApprovalEnabled {
		return false
	}

	config, err := as.GetRequiredActions()
	if err != nil {
		return false
	}

	switch actionType {
	case ApprovalActionToggleCreate:
		return config.ToggleCreate
	case ApprovalActionToggleUpdate:
		return config.ToggleUpdate
	case ApprovalActionToggleDelete:
		return config.ToggleDelete
	case ApprovalActionToggleEnable:
		return config.ToggleEnable
	case ApprovalActionToggleDisable:
		return config.ToggleDisable
	case ApprovalActionToggleRule:
		return config.ToggleRule
	case ApprovalActionApplicationCreate:
		return config.ApplicationCreate
	case ApprovalActionApplicationDelete:
		return config.ApplicationDelete
	case ApprovalActionSecretKeyCreate:
		return config.SecretKeyCreate
	case ApprovalActionSecretKeyDelete:
		return config.SecretKeyDelete
	default:
		return false
	}
}

// Enable habilita o sistema de aprovação
func (as *ApprovalSettings) Enable() {
	as.ApprovalEnabled = true
}

// Disable desabilita o sistema de aprovação
func (as *ApprovalSettings) Disable() {
	as.ApprovalEnabled = false
}

// SetExpirationDays define quantos dias as solicitações ficam válidas
func (as *ApprovalSettings) SetExpirationDays(days int) error {
	if days < 1 || days > 30 {
		return errors.New("expiration days must be between 1 and 30")
	}
	as.DefaultExpirationDays = days
	return nil
}

// Validate valida as configurações
func (as *ApprovalSettings) Validate() error {
	if as.DefaultExpirationDays < 1 || as.DefaultExpirationDays > 30 {
		return errors.New("default_expiration_days must be between 1 and 30")
	}

	// Validar se RequiredActions é um JSON válido
	var config ApprovalConfig
	if err := json.Unmarshal([]byte(as.RequiredActions), &config); err != nil {
		return errors.New("invalid required_actions format")
	}

	return nil
}

// ApprovalSettingsResponse representa a resposta para o frontend
type ApprovalSettingsResponse struct {
	ID                    string         `json:"id"`
	ApprovalEnabled       bool           `json:"approval_enabled"`
	RequiredActions       ApprovalConfig `json:"required_actions"`
	DefaultExpirationDays int            `json:"default_expiration_days"`
	CreatedAt             time.Time      `json:"created_at"`
	UpdatedAt             time.Time      `json:"updated_at"`
}

// ToResponse converte para a estrutura de resposta
func (as *ApprovalSettings) ToResponse() (*ApprovalSettingsResponse, error) {
	config, err := as.GetRequiredActions()
	if err != nil {
		return nil, err
	}

	return &ApprovalSettingsResponse{
		ID:                    as.ID,
		ApprovalEnabled:       as.ApprovalEnabled,
		RequiredActions:       *config,
		DefaultExpirationDays: as.DefaultExpirationDays,
		CreatedAt:             as.CreatedAt,
		UpdatedAt:             as.UpdatedAt,
	}, nil
}

// UpdateApprovalSettingsRequest representa uma solicitação de atualização
type UpdateApprovalSettingsRequest struct {
	ApprovalEnabled       *bool          `json:"approval_enabled,omitempty"`
	RequiredActions       *ApprovalConfig `json:"required_actions,omitempty"`
	DefaultExpirationDays *int           `json:"default_expiration_days,omitempty"`
}

// ApplyUpdate aplica as atualizações às configurações
func (as *ApprovalSettings) ApplyUpdate(req *UpdateApprovalSettingsRequest) error {
	if req.ApprovalEnabled != nil {
		as.ApprovalEnabled = *req.ApprovalEnabled
	}

	if req.RequiredActions != nil {
		if err := as.SetRequiredActions(req.RequiredActions); err != nil {
			return err
		}
	}

	if req.DefaultExpirationDays != nil {
		if err := as.SetExpirationDays(*req.DefaultExpirationDays); err != nil {
			return err
		}
	}

	return as.Validate()
}