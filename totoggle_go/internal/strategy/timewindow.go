package strategy

import (
	"strings"
	"time"

	"github.com/manorfm/toToggles/totoggle_go/internal/toggle"
)

// TimeWindowEvaluator matches a "HH:mm-HH:mm" 24h daily window against the current time. Needs
// no parameter — it reads the clock instead. An overnight window (start > end, e.g.
// "22:00-06:00") wraps past midnight.
type TimeWindowEvaluator struct {
	now func() time.Time
}

// NewTimeWindowEvaluator builds a TimeWindowEvaluator. now, if non-nil, is the clock to read the
// current time from — tests inject a fixed instant instead of depending on wall-clock time. A
// nil now defaults to time.Now.
func NewTimeWindowEvaluator(now func() time.Time) TimeWindowEvaluator {
	if now == nil {
		now = time.Now
	}
	return TimeWindowEvaluator{now: now}
}

func (e TimeWindowEvaluator) Evaluate(rule toggle.ActivationRule, key string, hasKey bool) bool {
	parts := strings.SplitN(rule.Value, "-", 2)
	if len(parts) != 2 {
		return false
	}

	start, err := minutesOfDayFromHHMM(strings.TrimSpace(parts[0]))
	if err != nil {
		return false
	}
	end, err := minutesOfDayFromHHMM(strings.TrimSpace(parts[1]))
	if err != nil {
		return false
	}

	now := minutesOfDay(e.now())
	if start <= end {
		return now >= start && now < end
	}
	// Overnight window, e.g. 22:00-06:00.
	return now >= start || now < end
}

func minutesOfDay(t time.Time) int {
	return t.Hour()*60 + t.Minute()
}

func minutesOfDayFromHHMM(s string) (int, error) {
	parsed, err := time.Parse("15:04", s)
	if err != nil {
		return 0, err
	}
	return minutesOfDay(parsed), nil
}
