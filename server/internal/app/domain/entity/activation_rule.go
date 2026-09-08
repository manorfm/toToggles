package entity

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

type activationRuleConfig struct {
	ContextKey string `json:"context_key"`
}

// ActivationRuleType define os tipos de regras de ativação
type ActivationRuleType string

const (
	ActivationRuleTypePercentage ActivationRuleType = "percentage"
	ActivationRuleTypeParameter  ActivationRuleType = "parameter"
	ActivationRuleTypeUserID     ActivationRuleType = "user_id"
	ActivationRuleTypeIP         ActivationRuleType = "ip"
	ActivationRuleTypeCountry    ActivationRuleType = "country"
	ActivationRuleTypeTime       ActivationRuleType = "time"
	ActivationRuleTypeCohort     ActivationRuleType = "cohort"
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
		percentage, err := strconv.ParseFloat(strings.TrimSpace(ar.Value), 64)
		if err != nil || percentage < 0 || percentage > 100 {
			return fmt.Errorf("porcentagem deve ser um número entre 0 e 100")
		}
	case ActivationRuleTypeParameter, ActivationRuleTypeUserID, ActivationRuleTypeIP, ActivationRuleTypeCountry, ActivationRuleTypeCohort:
		if ar.Value == "" {
			return fmt.Errorf("valor da regra é obrigatório")
		}
	case ActivationRuleTypeTime:
		if ar.Value == "" {
			return fmt.Errorf("valor do tempo é obrigatório")
		}
	default:
		return fmt.Errorf("tipo de regra inválido: %s", ar.Type)
	}
	if ar.Type == ActivationRuleTypeTime {
		return nil
	}
	var rawConfig map[string]json.RawMessage
	if len(ar.Config) > 0 && json.Unmarshal(ar.Config, &rawConfig) != nil {
		return fmt.Errorf("configuração context_key válida é obrigatória para regra %s", ar.Type)
	}
	if rawKey, ok := rawConfig["context_key"]; ok {
		var config activationRuleConfig
		if json.Unmarshal(rawKey, &config.ContextKey) != nil || !validContextKey(config.ContextKey) {
			return fmt.Errorf("configuração context_key válida é obrigatória para regra %s", ar.Type)
		}
	}
	if ar.Type == ActivationRuleTypeCohort {
		for _, value := range strings.Split(ar.Value, ",") {
			if v := strings.ToLower(strings.TrimSpace(value)); v == "true" || v == "false" {
				return fmt.Errorf("cohort não aceita valores booleanos")
			}
		}
	}
	return nil
}

func validContextKey(key string) bool {
	switch key {
	case "rollout_key", "user_id", "ip", "country", "cohort":
		return true
	}
	return strings.HasPrefix(key, "attributes.") && len(strings.TrimPrefix(key, "attributes.")) > 0
}

// GetRuleTypeOptions retorna as opções disponíveis para tipos de regra
func GetRuleTypeOptions() map[ActivationRuleType]string {
	return map[ActivationRuleType]string{
		ActivationRuleTypePercentage: "Percentage - Ativar para X% de uma população identificada pela rollout key",
		ActivationRuleTypeParameter:  "Parameter - Ativar baseado em parâmetro específico",
		ActivationRuleTypeUserID:     "User ID - Ativar para usuários específicos",
		ActivationRuleTypeIP:         "IP Address - Ativar para IPs específicos",
		ActivationRuleTypeCountry:    "Country - Ativar para países específicos",
		ActivationRuleTypeTime:       "Time - Ativar em horários específicos",
		ActivationRuleTypeCohort:     "Cohort - Ativar para coortes/rings de deploy (ex.: canary, beta)",
	}
}
