package toggle

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestActivationRule_IsEmpty_BothBlank(t *testing.T) {
	r := ActivationRule{}
	assert.True(t, r.IsEmpty())
	assert.False(t, r.IsValid())
}

func TestActivationRule_IsEmpty_TypeAndValueSet(t *testing.T) {
	r := ActivationRule{Type: RuleTypePercentage, Value: "25"}
	assert.False(t, r.IsEmpty())
	assert.True(t, r.IsValid())
}

func TestActivationRule_IsValid_RequiresBothTypeAndValue(t *testing.T) {
	tests := []struct {
		name  string
		rule  ActivationRule
		valid bool
	}{
		{"both set", ActivationRule{Type: RuleTypeParameter, Value: "premium"}, true},
		{"type only", ActivationRule{Type: RuleTypeParameter}, false},
		{"value only", ActivationRule{Value: "premium"}, false},
		{"neither", ActivationRule{}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.valid, tt.rule.IsValid())
		})
	}
}

// The 7 server-defined rule types (server/internal/app/domain/entity/activation_rule.go) —
// locking these in as a regression test: a typo in any of these strings would silently mean the
// client never matches a rule the server actually configured.
func TestRuleType_Constants(t *testing.T) {
	assert.Equal(t, RuleType("percentage"), RuleTypePercentage)
	assert.Equal(t, RuleType("parameter"), RuleTypeParameter)
	assert.Equal(t, RuleType("user_id"), RuleTypeUserID)
	assert.Equal(t, RuleType("ip"), RuleTypeIP)
	assert.Equal(t, RuleType("country"), RuleTypeCountry)
	assert.Equal(t, RuleType("time"), RuleTypeTime)
	assert.Equal(t, RuleType("canary"), RuleTypeCanary)
}
