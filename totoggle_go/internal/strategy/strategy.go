// Package strategy holds one Evaluator per activation-rule type (percentage, attribute, user_id,
// ip, country, time, cohort) plus a Registry that dispatches a rule to the evaluator for its
// Type — the Client asks the Registry, never a concrete evaluator directly.
package strategy

import (
	"fmt"

	"github.com/manorfm/toToggles/totoggle_go/internal/toggle"
)

// Evaluator decides whether an activation rule matches a given evaluation key (e.g. the
// context value obtained by the configured resolver. The meaning of key is defined by the rule
// type; hasKey distinguishes unavailable context from an explicitly empty context value.
type Evaluator interface {
	Evaluate(rule toggle.ActivationRule, key string, hasKey bool) bool
}

// Registry dispatches a rule to the Evaluator registered for its Type.
type Registry struct {
	evaluators map[toggle.RuleType]Evaluator
}

// NewRegistry returns an empty Registry — evaluators are added via Register.
func NewRegistry() *Registry {
	return &Registry{evaluators: make(map[toggle.RuleType]Evaluator)}
}

// Register associates an Evaluator with a rule type, overwriting any prior registration for
// that type.
func (r *Registry) Register(t toggle.RuleType, e Evaluator) {
	r.evaluators[t] = e
}

// Evaluate looks up the Evaluator for rule.Type and delegates to it. An unregistered type is an
// error, not a silent false — a typo'd or unsupported rule type should never masquerade as "does
// not match".
func (r *Registry) Evaluate(rule toggle.ActivationRule, key string, hasKey bool) (bool, error) {
	e, ok := r.evaluators[rule.Type]
	if !ok {
		return false, fmt.Errorf("strategy: no evaluator registered for rule type %q", rule.Type)
	}
	return e.Evaluate(rule, key, hasKey), nil
}
