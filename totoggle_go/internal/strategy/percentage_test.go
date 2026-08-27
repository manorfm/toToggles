package strategy

import (
	"strconv"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/manorfm/toToggles/totoggle_go/internal/toggle"
)

func TestPercentageEvaluator_KeyedEvaluationIsDeterministic(t *testing.T) {
	e := NewPercentageEvaluator(nil)
	rule := toggle.ActivationRule{Type: toggle.RuleTypePercentage, Value: "50"}

	first := e.Evaluate(rule, "user-42", true)
	for i := 0; i < 20; i++ {
		assert.Equal(t, first, e.Evaluate(rule, "user-42", true))
	}
}

func TestPercentageEvaluator_DifferentKeysCanLandInDifferentBuckets(t *testing.T) {
	e := NewPercentageEvaluator(nil)
	rule := toggle.ActivationRule{Type: toggle.RuleTypePercentage, Value: "50"}

	results := make(map[bool]bool)
	for i := 0; i < 100; i++ {
		results[e.Evaluate(rule, "user-"+strconv.Itoa(i), true)] = true
	}
	assert.Len(t, results, 2, "expected both true and false outcomes across 100 distinct keys at 50%%")
}

func TestPercentageEvaluator_ZeroPercentNeverActivatesAKeyedCall(t *testing.T) {
	e := NewPercentageEvaluator(nil)
	rule := toggle.ActivationRule{Type: toggle.RuleTypePercentage, Value: "0"}

	for i := 0; i < 50; i++ {
		assert.False(t, e.Evaluate(rule, "user-"+strconv.Itoa(i), true))
	}
}

func TestPercentageEvaluator_HundredPercentAlwaysActivatesAKeyedCall(t *testing.T) {
	e := NewPercentageEvaluator(nil)
	rule := toggle.ActivationRule{Type: toggle.RuleTypePercentage, Value: "100"}

	for i := 0; i < 50; i++ {
		assert.True(t, e.Evaluate(rule, "user-"+strconv.Itoa(i), true))
	}
}

func TestPercentageEvaluator_InvalidValueNeverActivates(t *testing.T) {
	e := NewPercentageEvaluator(nil)
	rule := toggle.ActivationRule{Type: toggle.RuleTypePercentage, Value: "not-a-number"}

	assert.False(t, e.Evaluate(rule, "user-1", true))
}

func TestPercentageEvaluator_OutOfRangeValueNeverActivates(t *testing.T) {
	e := NewPercentageEvaluator(nil)

	assert.False(t, e.Evaluate(toggle.ActivationRule{Value: "150"}, "user-1", true))
	assert.False(t, e.Evaluate(toggle.ActivationRule{Value: "-1"}, "user-1", true))
}

// With no key at all (Client.IsActive, no parameter), the evaluator has nothing to key a
// deterministic bucket on — it falls back to the injected random source instead.
func TestPercentageEvaluator_NoKeyUsesInjectedRandomSource(t *testing.T) {
	e := NewPercentageEvaluator(func() float64 { return 0.1 }) // -> bucket 10
	rule := toggle.ActivationRule{Value: "50"}

	assert.True(t, e.Evaluate(rule, "", false))

	e2 := NewPercentageEvaluator(func() float64 { return 0.9 }) // -> bucket 90
	assert.False(t, e2.Evaluate(rule, "", false))
}
