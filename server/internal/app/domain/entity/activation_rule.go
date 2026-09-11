package entity

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"unicode"
)

// timeWindowPattern matches "HH:mm-HH:mm", 24h, zero-padded, the same format every client SDK's
// TimeWindowEvaluator/TimeStrategy parses (e.g. totoggle_go's time.Parse("15:04", ...)). Deliberately
// permissive about which side is larger — an overnight window (e.g. "22:00-06:00") is valid, wrapping
// past midnight, same as every SDK's evaluator.
var timeWindowPattern = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$`)

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
		if !timeWindowPattern.MatchString(ar.Value) {
			return fmt.Errorf("valor do tempo deve estar no formato HH:mm-HH:mm (ex.: 09:00-18:00)")
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

// ContextKey returns the rule's configured context_key, or "" when Config is absent, malformed,
// or has no context_key — same permissive parsing as ValidateRule, but never returns an error
// since callers here only want a best-effort read (e.g. HasEphemeralContextKeyRisk), not
// enforcement.
func (ar *ActivationRule) ContextKey() string {
	var rawConfig map[string]json.RawMessage
	if len(ar.Config) == 0 || json.Unmarshal(ar.Config, &rawConfig) != nil {
		return ""
	}
	rawKey, ok := rawConfig["context_key"]
	if !ok {
		return ""
	}
	var key string
	if json.Unmarshal(rawKey, &key) != nil {
		return ""
	}
	return key
}

// ephemeralContextKeyTokens are attribute-name tokens (split on non-alphanumeric characters)
// that suggest the underlying value can legitimately change between two requests from the same
// real person — defeating percentage's "same user, same bucket" deterministic-hashing guarantee.
// Matched as whole tokens, not substrings, so "recipient_id" doesn't false-positive on "ip".
var ephemeralContextKeyTokens = map[string]bool{
	"ip": true, "session": true, "request": true, "token": true, "nonce": true,
}

// HasEphemeralContextKeyRisk reports whether this rule's bucketing key is likely a per-request-
// unstable value rather than a durable identity. validContextKey already restricts a canonical
// rule's context_key to one fixed value (e.g. cohort's is always the literal "cohort"), so this
// can only ever fire for percentage's `attributes.<name>` form — the one context_key shape whose
// name is admin-chosen free text. It's a heuristic over that NAME (not proof of what an app's
// resolver actually returns for it): a percentage rule bucketing on `attributes.session_id` or
// `attributes.client_ip` almost certainly won't give the same person a stable result across
// requests, silently breaking the deterministic-hashing guarantee described in
// docs/rest-flow.md's rollout-key contract note. Advisory only — never blocks saving the rule.
func (ar *ActivationRule) HasEphemeralContextKeyRisk() bool {
	if ar.Type != ActivationRuleTypePercentage {
		return false
	}
	const attributesPrefix = "attributes."
	key := ar.ContextKey()
	if !strings.HasPrefix(key, attributesPrefix) {
		return false
	}
	name := strings.TrimPrefix(key, attributesPrefix)
	for _, token := range strings.FieldsFunc(name, func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsDigit(r) }) {
		if ephemeralContextKeyTokens[strings.ToLower(token)] {
			return true
		}
	}
	return false
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
