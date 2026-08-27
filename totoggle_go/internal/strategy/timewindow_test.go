package strategy

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/manorfm/toToggles/totoggle_go/internal/toggle"
)

func at(t *testing.T, hhmm string) func() time.Time {
	t.Helper()
	parsed, err := time.Parse("15:04", hhmm)
	if err != nil {
		t.Fatalf("bad test fixture time %q: %v", hhmm, err)
	}
	return func() time.Time { return parsed }
}

func TestTimeWindowEvaluator_WithinWindow(t *testing.T) {
	e := NewTimeWindowEvaluator(at(t, "12:00"))
	rule := toggle.ActivationRule{Type: toggle.RuleTypeTime, Value: "09:00-18:00"}

	assert.True(t, e.Evaluate(rule, "", false))
}

func TestTimeWindowEvaluator_BeforeWindow(t *testing.T) {
	e := NewTimeWindowEvaluator(at(t, "08:59"))
	rule := toggle.ActivationRule{Value: "09:00-18:00"}

	assert.False(t, e.Evaluate(rule, "", false))
}

func TestTimeWindowEvaluator_AtOrAfterEndIsExclusive(t *testing.T) {
	e := NewTimeWindowEvaluator(at(t, "18:00"))
	rule := toggle.ActivationRule{Value: "09:00-18:00"}

	assert.False(t, e.Evaluate(rule, "", false))
}

func TestTimeWindowEvaluator_StartIsInclusive(t *testing.T) {
	e := NewTimeWindowEvaluator(at(t, "09:00"))
	rule := toggle.ActivationRule{Value: "09:00-18:00"}

	assert.True(t, e.Evaluate(rule, "", false))
}

func TestTimeWindowEvaluator_OvernightWindowWrapsPastMidnight(t *testing.T) {
	rule := toggle.ActivationRule{Value: "22:00-06:00"}

	assert.True(t, NewTimeWindowEvaluator(at(t, "23:00")).Evaluate(rule, "", false))
	assert.True(t, NewTimeWindowEvaluator(at(t, "02:00")).Evaluate(rule, "", false))
	assert.False(t, NewTimeWindowEvaluator(at(t, "12:00")).Evaluate(rule, "", false))
}

func TestTimeWindowEvaluator_MalformedWindowNeverMatches(t *testing.T) {
	e := NewTimeWindowEvaluator(at(t, "12:00"))

	assert.False(t, e.Evaluate(toggle.ActivationRule{Value: "not-a-window"}, "", false))
	assert.False(t, e.Evaluate(toggle.ActivationRule{Value: "9am-6pm"}, "", false))
}

func TestTimeWindowEvaluator_NilClockDefaultsToRealTime(t *testing.T) {
	e := NewTimeWindowEvaluator(nil)
	rule := toggle.ActivationRule{Value: "00:00-23:59"}

	assert.True(t, e.Evaluate(rule, "", false))
}
