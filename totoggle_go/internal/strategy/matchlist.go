package strategy

import (
	"strings"

	"github.com/manorfm/toToggles/totoggle_go/internal/toggle"
)

// MatchListEvaluator implements the "comma-separated allowlist, exact trimmed match" shape
// shared by four otherwise-identical rule types (parameter, user_id, country, canary — the
// confirmed prototype hints describe all four the same way). One implementation registered
// under all four types, instead of four copies of the same logic.
type MatchListEvaluator struct{}

// Evaluate reports whether key exactly matches one entry of rule.Value's comma-separated list,
// after trimming whitespace around each entry. No key, or a blank rule value, never matches.
func (MatchListEvaluator) Evaluate(rule toggle.ActivationRule, key string, hasKey bool) bool {
	if !hasKey {
		return false
	}
	if strings.TrimSpace(rule.Value) == "" {
		return false
	}
	for _, entry := range strings.Split(rule.Value, ",") {
		if strings.TrimSpace(entry) == key {
			return true
		}
	}
	return false
}
