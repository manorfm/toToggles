package strategy

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/manorfm/toToggles/totoggle_go/internal/toggle"
)

// MatchListEvaluator is the one implementation shared by parameter, user_id, country, and canary
// — all four are "comma-separated allowlist, exact trimmed match" per the confirmed prototype
// hints, so this is a single reused type rather than four near-identical copies.
func TestMatchListEvaluator_MatchesOneOfCommaSeparatedValues(t *testing.T) {
	e := MatchListEvaluator{}
	rule := toggle.ActivationRule{Type: toggle.RuleTypeParameter, Value: "premium,enterprise"}

	assert.True(t, e.Evaluate(rule, "premium", true))
	assert.True(t, e.Evaluate(rule, "enterprise", true))
	assert.False(t, e.Evaluate(rule, "basic", true))
}

func TestMatchListEvaluator_TrimsWhitespaceAroundEntries(t *testing.T) {
	e := MatchListEvaluator{}
	rule := toggle.ActivationRule{Type: toggle.RuleTypeCountry, Value: " BR , US ,CA"}

	assert.True(t, e.Evaluate(rule, "BR", true))
	assert.True(t, e.Evaluate(rule, "US", true))
	assert.True(t, e.Evaluate(rule, "CA", true))
	assert.False(t, e.Evaluate(rule, "br", true))
}

func TestMatchListEvaluator_NoKeyNeverMatches(t *testing.T) {
	e := MatchListEvaluator{}
	rule := toggle.ActivationRule{Type: toggle.RuleTypeUserID, Value: "user-1,user-2"}

	assert.False(t, e.Evaluate(rule, "", false))
}

func TestMatchListEvaluator_BlankRuleValueNeverMatches(t *testing.T) {
	e := MatchListEvaluator{}
	rule := toggle.ActivationRule{Type: toggle.RuleTypeCanary, Value: "   "}

	assert.False(t, e.Evaluate(rule, "true", true))
}

func TestMatchListEvaluator_EmptyStringKeyCanMatchAnEmptyListEntry(t *testing.T) {
	e := MatchListEvaluator{}
	rule := toggle.ActivationRule{Type: toggle.RuleTypeCanary, Value: "true,"}

	assert.True(t, e.Evaluate(rule, "", true))
}
