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
	ActivationRuleTypeAttribute  ActivationRuleType = "attribute"
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
	case ActivationRuleTypeAttribute, ActivationRuleTypeUserID, ActivationRuleTypeIP, ActivationRuleTypeCountry, ActivationRuleTypeCohort:
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
		if len(ar.Config) == 0 || string(ar.Config) == "null" {
			return nil
		}
		return fmt.Errorf("regra time não aceita context_key")
	}
	var rawConfig map[string]json.RawMessage
	if len(ar.Config) == 0 || json.Unmarshal(ar.Config, &rawConfig) != nil {
		return fmt.Errorf("configuração context_key válida é obrigatória para regra %s", ar.Type)
	}
	rawKey, ok := rawConfig["context_key"]
	if !ok {
		return fmt.Errorf("configuração context_key válida é obrigatória para regra %s", ar.Type)
	}
	var config activationRuleConfig
	if json.Unmarshal(rawKey, &config.ContextKey) != nil || !validContextKey(ar.Type, config.ContextKey) {
		return fmt.Errorf("configuração context_key válida é obrigatória para regra %s", ar.Type)
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

func validContextKey(ruleType ActivationRuleType, key string) bool {
	if strings.HasPrefix(key, "attributes.") {
		return len(strings.TrimPrefix(key, "attributes.")) > 0 &&
			(ruleType == ActivationRuleTypePercentage || ruleType == ActivationRuleTypeAttribute)
	}
	return (ruleType == ActivationRuleTypePercentage && key == "rollout_key") ||
		(ruleType == ActivationRuleTypeUserID && key == "user_id") ||
		(ruleType == ActivationRuleTypeIP && key == "ip") ||
		(ruleType == ActivationRuleTypeCountry && key == "country") ||
		(ruleType == ActivationRuleTypeCohort && key == "cohort")
}

// GetRuleTypeOptions retorna as opções disponíveis para tipos de regra
func GetRuleTypeOptions() map[ActivationRuleType]string {
	return map[ActivationRuleType]string{
		ActivationRuleTypePercentage: "Percentage - Ativar para X% de uma população identificada pela rollout key",
		ActivationRuleTypeAttribute:  "Attribute - Ativar baseado em atributo de contexto",
		ActivationRuleTypeUserID:     "User ID - Ativar para usuários específicos",
		ActivationRuleTypeIP:         "IP Address - Ativar para IPs específicos",
		ActivationRuleTypeCountry:    "Country - Ativar para países específicos",
		ActivationRuleTypeTime:       "Time - Ativar em horários específicos",
		ActivationRuleTypeCohort:     "Cohort - Ativar para coortes/rings de deploy (ex.: canary, beta)",
	}
}
