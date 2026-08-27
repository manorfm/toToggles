package toggle

// RuleType is one of the 7 activation-rule types the server supports
// (server/internal/app/domain/entity/activation_rule.go#ActivationRuleType) — a typed string so
// a typo can't silently compile as a valid, never-matching type the way a bare string could.
type RuleType string

const (
	RuleTypePercentage RuleType = "percentage"
	RuleTypeParameter  RuleType = "parameter"
	RuleTypeUserID     RuleType = "user_id"
	RuleTypeIP         RuleType = "ip"
	RuleTypeCountry    RuleType = "country"
	RuleTypeTime       RuleType = "time"
	RuleTypeCanary     RuleType = "canary"
)

// ActivationRule is a value object: Type and Value together define a condition, and neither is
// meaningful alone (a Value with no Type, or vice versa, is never a valid rule).
type ActivationRule struct {
	Type  RuleType `json:"type"`
	Value string   `json:"value"`
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
