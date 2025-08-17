package entity

import (
	"encoding/json"
	"fmt"
)

// ActivationRuleType define os tipos de regras de ativação
type ActivationRuleType string

const (
	ActivationRuleTypePercentage    ActivationRuleType = "percentage"
	ActivationRuleTypeParameter     ActivationRuleType = "parameter"
	ActivationRuleTypeUserID        ActivationRuleType = "user_id"
	ActivationRuleTypeIP            ActivationRuleType = "ip"
	ActivationRuleTypeCountry       ActivationRuleType = "country"
	ActivationRuleTypeTime          ActivationRuleType = "time"
	ActivationRuleTypeCanary        ActivationRuleType = "canary"
)

// ActivationRule representa uma regra de ativação para um toggle
type ActivationRule struct {
	Type   ActivationRuleType `json:"type" gorm:"type:varchar(50)"`
	Value  string             `json:"value" gorm:"type:varchar(255)"`
	Config json.RawMessage    `json:"config,omitempty" gorm:"type:text"`
}

// ValidateRule valida se a regra de ativação está correta
func (ar *ActivationRule) ValidateRule() error {
	switch ar.Type {
	case ActivationRuleTypePercentage:
		if ar.Value == "" {
			return fmt.Errorf("valor de porcentagem é obrigatório")
		}
		// Validar se é um número entre 0 e 100
	case ActivationRuleTypeParameter:
		if ar.Value == "" {
			return fmt.Errorf("valor do parâmetro é obrigatório")
		}
	case ActivationRuleTypeUserID:
		if ar.Value == "" {
			return fmt.Errorf("valor do user ID é obrigatório")
		}
	case ActivationRuleTypeIP:
		if ar.Value == "" {
			return fmt.Errorf("valor do IP é obrigatório")
		}
	case ActivationRuleTypeCountry:
		if ar.Value == "" {
			return fmt.Errorf("valor do país é obrigatório")
		}
	case ActivationRuleTypeTime:
		if ar.Value == "" {
			return fmt.Errorf("valor do tempo é obrigatório")
		}
	case ActivationRuleTypeCanary:
		if ar.Value == "" {
			return fmt.Errorf("valor do canary é obrigatório")
		}
	default:
		return fmt.Errorf("tipo de regra inválido: %s", ar.Type)
	}
	return nil
}

// GetRuleTypeOptions retorna as opções disponíveis para tipos de regra
func GetRuleTypeOptions() map[ActivationRuleType]string {
	return map[ActivationRuleType]string{
		ActivationRuleTypePercentage: "Percentage - Ativar para X% das requisições",
		ActivationRuleTypeParameter:  "Parameter - Ativar baseado em parâmetro específico",
		ActivationRuleTypeUserID:     "User ID - Ativar para usuários específicos",
		ActivationRuleTypeIP:         "IP Address - Ativar para IPs específicos",
		ActivationRuleTypeCountry:    "Country - Ativar para países específicos",
		ActivationRuleTypeTime:       "Time - Ativar em horários específicos",
		ActivationRuleTypeCanary:     "Canary - Ativar para releases canário",
	}
}