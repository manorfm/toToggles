package strategy

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/manorfm/toToggles/totoggle_go/internal/toggle"
)

// stubEvaluator is a minimal Evaluator used only to prove Registry dispatch — the real
// evaluators (percentage, matchlist-based, ip, timewindow) get their own dedicated tests.
type stubEvaluator struct {
	result    bool
	gotKey    string
	gotHasKey bool
	wasCalled bool
}

func (s *stubEvaluator) Evaluate(rule toggle.ActivationRule, key string, hasKey bool) bool {
	s.wasCalled = true
	s.gotKey = key
	s.gotHasKey = hasKey
	return s.result
}

func TestRegistry_Evaluate_DispatchesToRegisteredType(t *testing.T) {
	reg := NewRegistry()
	stub := &stubEvaluator{result: true}
	reg.Register(toggle.RuleTypePercentage, stub)

	got, err := reg.Evaluate(toggle.ActivationRule{Type: toggle.RuleTypePercentage, Value: "50"}, "user-1", true)
	require.NoError(t, err)
	assert.True(t, got)
	assert.True(t, stub.wasCalled)
	assert.Equal(t, "user-1", stub.gotKey)
	assert.True(t, stub.gotHasKey)
}

// hasKey must reach the evaluator faithfully — IsActive (no parameter) and IsActiveFor("")
// (an explicit empty parameter) are different callers and must stay distinguishable downstream.
func TestRegistry_Evaluate_PropagatesNoKeyDistinctFromEmptyKey(t *testing.T) {
	reg := NewRegistry()
	stub := &stubEvaluator{result: false}
	reg.Register(toggle.RuleTypePercentage, stub)

	_, err := reg.Evaluate(toggle.ActivationRule{Type: toggle.RuleTypePercentage, Value: "50"}, "", false)
	require.NoError(t, err)
	assert.False(t, stub.gotHasKey)
}

func TestRegistry_Evaluate_UnknownRuleTypeReturnsError(t *testing.T) {
	reg := NewRegistry()

	_, err := reg.Evaluate(toggle.ActivationRule{Type: "made-up", Value: "x"}, "user-1", true)
	require.Error(t, err)
}
