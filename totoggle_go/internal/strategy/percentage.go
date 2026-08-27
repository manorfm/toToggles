package strategy

import (
	"hash/fnv"
	"math/rand"
	"strconv"

	"github.com/manorfm/toToggles/totoggle_go/internal/toggle"
)

// PercentageEvaluator activates a configured percentage of evaluations. With a key (a stable
// per-user/session identifier), the bucket is deterministic — the same key + rule value always
// lands in the same bucket, via FNV-1a (Go has no equivalent to Java's JLS-specified
// String.hashCode(), so this deliberately isn't bit-identical to the Kotlin client's bucketing —
// only self-consistent within one client, which is what "same user always gets the same result"
// actually requires). With no key, there is nothing to be consistent with, so it falls back to a
// per-call random draw.
type PercentageEvaluator struct {
	randomBucket func() float64 // returns a value in [0, 1)
}

// NewPercentageEvaluator builds a PercentageEvaluator. randomSource, if non-nil, is used as the
// source of randomness for no-key evaluations (returning a float in [0, 1)) — tests inject a
// fixed source instead of depending on real randomness. A nil randomSource defaults to
// math/rand.
func NewPercentageEvaluator(randomSource func() float64) PercentageEvaluator {
	if randomSource == nil {
		randomSource = rand.Float64
	}
	return PercentageEvaluator{randomBucket: randomSource}
}

func (p PercentageEvaluator) Evaluate(rule toggle.ActivationRule, key string, hasKey bool) bool {
	percentage, err := strconv.ParseFloat(rule.Value, 64)
	if err != nil {
		return false
	}
	if percentage < 0 || percentage > 100 {
		return false
	}

	var bucket float64
	if hasKey {
		bucket = consistentBucket(rule.Value, key)
	} else {
		bucket = p.randomBucket() * 100
	}
	return bucket < percentage
}

// consistentBucket derives a deterministic value in [0, 100) from ruleValue+key.
func consistentBucket(ruleValue, key string) float64 {
	h := fnv.New32a()
	_, _ = h.Write([]byte(ruleValue + ":" + key))
	return float64(h.Sum32()%10000) / 100.0
}
