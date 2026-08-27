package totoggle

import "sync"

// RefreshSuccessListener is notified after a successful toggle refresh (background or forced
// via Client.Refresh).
type RefreshSuccessListener interface {
	OnRefreshSuccess(toggleCount int)
}

// RefreshFailureListener is notified after a failed refresh attempt, with the running count of
// consecutive failures (reset to 0 on the next success) — a single call means "just failed
// once"; a growing count means the server/network has been unreachable for a while.
type RefreshFailureListener interface {
	OnRefreshFailure(err error, consecutiveFailures int)
}

// EvaluationListener is notified after every IsActive/IsActiveFor call that completed (including
// ones that resolved to false because the toggle wasn't found, or the client wasn't started).
type EvaluationListener interface {
	OnEvaluation(path string, result bool)
}

// metricsRegistry holds the listeners registered via Client.AddMetricsListener, split by which
// of the 3 small interfaces each one implements — Go has no default interface methods, so a
// single listener implementing only 1 of the 3 must not be forced to stub the other 2.
type metricsRegistry struct {
	mu       sync.RWMutex
	success  []RefreshSuccessListener
	failure  []RefreshFailureListener
	evaluate []EvaluationListener
}

func newMetricsRegistry() *metricsRegistry {
	return &metricsRegistry{}
}

// add registers l under every one of RefreshSuccessListener/RefreshFailureListener/
// EvaluationListener that it implements — none, one, two, or all three.
func (m *metricsRegistry) add(l any) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s, ok := l.(RefreshSuccessListener); ok {
		m.success = append(m.success, s)
	}
	if f, ok := l.(RefreshFailureListener); ok {
		m.failure = append(m.failure, f)
	}
	if e, ok := l.(EvaluationListener); ok {
		m.evaluate = append(m.evaluate, e)
	}
}

func (m *metricsRegistry) notifyRefreshSuccess(toggleCount int) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, l := range m.success {
		safelyCall(func() { l.OnRefreshSuccess(toggleCount) })
	}
}

func (m *metricsRegistry) notifyRefreshFailure(err error, consecutiveFailures int) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, l := range m.failure {
		safelyCall(func() { l.OnRefreshFailure(err, consecutiveFailures) })
	}
}

func (m *metricsRegistry) notifyEvaluation(path string, result bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, l := range m.evaluate {
		safelyCall(func() { l.OnEvaluation(path, result) })
	}
}

// safelyCall runs f, discarding a panic — a broken caller-supplied listener must never take
// down toggle evaluation or the background refresh loop.
func safelyCall(f func()) {
	defer func() { _ = recover() }()
	f()
}
