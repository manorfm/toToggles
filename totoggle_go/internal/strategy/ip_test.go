package strategy

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/manorfm/toToggles/totoggle_go/internal/toggle"
)

func TestIPEvaluator_ExactMatch(t *testing.T) {
	e := IPEvaluator{}
	rule := toggle.ActivationRule{Type: toggle.RuleTypeIP, Value: "10.0.0.5,192.168.1.1"}

	assert.True(t, e.Evaluate(rule, "10.0.0.5", true))
	assert.True(t, e.Evaluate(rule, "192.168.1.1", true))
	assert.False(t, e.Evaluate(rule, "10.0.0.6", true))
}

func TestIPEvaluator_CIDRRange(t *testing.T) {
	e := IPEvaluator{}
	rule := toggle.ActivationRule{Type: toggle.RuleTypeIP, Value: "10.0.0.0/24"}

	assert.True(t, e.Evaluate(rule, "10.0.0.1", true))
	assert.True(t, e.Evaluate(rule, "10.0.0.254", true))
	assert.False(t, e.Evaluate(rule, "10.0.1.1", true))
}

func TestIPEvaluator_MixedExactAndCIDREntries(t *testing.T) {
	e := IPEvaluator{}
	rule := toggle.ActivationRule{Value: "203.0.113.9, 10.0.0.0/24"}

	assert.True(t, e.Evaluate(rule, "203.0.113.9", true))
	assert.True(t, e.Evaluate(rule, "10.0.0.42", true))
	assert.False(t, e.Evaluate(rule, "203.0.113.10", true))
}

func TestIPEvaluator_NoKeyNeverMatches(t *testing.T) {
	e := IPEvaluator{}
	rule := toggle.ActivationRule{Value: "10.0.0.0/24"}

	assert.False(t, e.Evaluate(rule, "", false))
}

func TestIPEvaluator_UnparseableCandidateNeverMatches(t *testing.T) {
	e := IPEvaluator{}
	rule := toggle.ActivationRule{Value: "10.0.0.0/24"}

	assert.False(t, e.Evaluate(rule, "not-an-ip", true))
}

func TestIPEvaluator_MalformedEntryIsSkippedNotFatal(t *testing.T) {
	e := IPEvaluator{}
	rule := toggle.ActivationRule{Value: "not-a-cidr/99, 10.0.0.5"}

	assert.True(t, e.Evaluate(rule, "10.0.0.5", true))
}

func TestIPEvaluator_BlankRuleValueNeverMatches(t *testing.T) {
	e := IPEvaluator{}
	rule := toggle.ActivationRule{Value: ""}

	assert.False(t, e.Evaluate(rule, "10.0.0.5", true))
}

func TestIPEvaluator_IPv6LiteralAndCIDR(t *testing.T) {
	e := IPEvaluator{}
	rule := toggle.ActivationRule{Value: "2001:db8:42::/64,2001:db8:ffff::7"}

	assert.True(t, e.Evaluate(rule, "2001:db8:42::123", true))
	assert.True(t, e.Evaluate(rule, "2001:db8:ffff::7", true))
	assert.False(t, e.Evaluate(rule, "2001:db8:43::1", true))
}

func TestIPEvaluator_MalformedIPv6NeverMatches(t *testing.T) {
	e := IPEvaluator{}
	rule := toggle.ActivationRule{Value: "2001:db8::/32"}

	assert.False(t, e.Evaluate(rule, "2001:db8:::1", true))
	assert.False(t, e.Evaluate(rule, "2001:db8::1/64", true))
}
