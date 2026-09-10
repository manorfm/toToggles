package toggle

import (
	"bytes"
	"encoding/json"
	"strings"
)

// RuleType is one of the 7 activation-rule types the server supports
// (server/internal/app/domain/entity/activation_rule.go#ActivationRuleType) — a typed string so
// a typo can't silently compile as a valid, never-matching type the way a bare string could.
type RuleType string

const (
	RuleTypePercentage RuleType = "percentage"
	RuleTypeAttribute  RuleType = "attribute"
	RuleTypeUserID     RuleType = "user_id"
	RuleTypeIP         RuleType = "ip"
	RuleTypeCountry    RuleType = "country"
	RuleTypeTime       RuleType = "time"
	RuleTypeCohort     RuleType = "cohort"
)

// ActivationRule is a value object: Type and Value together define a condition, and neither is
// meaningful alone (a Value with no Type, or vice versa, is never a valid rule).
type ActivationRule struct {
	Type   RuleType        `json:"type"`
	Value  string          `json:"value"`
	Config json.RawMessage `json:"config"`
}

// ContextKey returns a canonical configured provider key. A catalogue is untrusted input even
// after the server has validated it, so incompatible type/key pairs fail closed in the SDK before
// a resolver is invoked.
func (r ActivationRule) ContextKey() (string, bool) {
	if r.Type == RuleTypeTime {
		return "", len(r.Config) == 0 || bytes.Equal(bytes.TrimSpace(r.Config), []byte("null"))
	}
	var config struct {
		ContextKey string `json:"context_key"`
	}
	if json.Unmarshal(r.Config, &config) != nil || !validContextKey(r.Type, config.ContextKey) {
		return "", false
	}
	return config.ContextKey, true
}

func validContextKey(ruleType RuleType, key string) bool {
	if strings.HasPrefix(key, "attributes.") {
		return len(strings.TrimPrefix(key, "attributes.")) > 0 &&
			(ruleType == RuleTypePercentage || ruleType == RuleTypeAttribute)
	}
	return (ruleType == RuleTypePercentage && key == "rollout_key") ||
		(ruleType == RuleTypeUserID && key == "user_id") ||
		(ruleType == RuleTypeIP && key == "ip") ||
		(ruleType == RuleTypeCountry && key == "country") ||
		(ruleType == RuleTypeCohort && key == "cohort")
}

// IsEmpty reports whether this is "no rule configured" (both fields blank).
func (r ActivationRule) IsEmpty() bool {
	return r.Type == "" && r.Value == ""
}

// IsValid reports whether this rule has both a type and a value — required for it to be
// evaluated at all.
func (r ActivationRule) IsValid() bool {
	return r.Type != "" && r.Value != ""
}
