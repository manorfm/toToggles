package middleware

import (
	"sync"
	"time"
)

// slidingWindowLimiter is a simple in-memory, single-process sliding-window rate limiter, keyed
// by an arbitrary string. Shared by LoginRateLimit (keyed by client IP) and KillSwitchRateLimit
// (keyed by secret key ID) instead of each maintaining its own copy of the same window/attempt
// bookkeeping.
type slidingWindowLimiter struct {
	mu       sync.Mutex
	attempts map[string]*windowAttempt
	limit    int
	window   time.Duration
}

type windowAttempt struct {
	count      int
	windowFrom time.Time
}

func newSlidingWindowLimiter(limit int, window time.Duration) *slidingWindowLimiter {
	return &slidingWindowLimiter{
		attempts: make(map[string]*windowAttempt),
		limit:    limit,
		window:   window,
	}
}

func (l *slidingWindowLimiter) allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	a, exists := l.attempts[key]
	if !exists || now.Sub(a.windowFrom) > l.window {
		l.attempts[key] = &windowAttempt{count: 1, windowFrom: now}
		return true
	}

	if a.count >= l.limit {
		return false
	}
	a.count++
	return true
}

func (l *slidingWindowLimiter) reset(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.attempts, key)
}
