// Package cache holds the thread-safe, in-memory Application snapshot the Client reads from —
// evaluation never touches the network, only this cache, and a failed refresh never wipes it.
package cache

import (
	"sync"
	"time"

	"github.com/manorfm/toToggles/totoggle_go/internal/toggle"
)

// Stats is a point-in-time snapshot of cache health, for the Client's observability getters.
type Stats struct {
	ToggleCount         int
	LastSuccessAt       time.Time
	LastErrorAt         time.Time
	LastError           error
	ConsecutiveFailures int
}

// Cache is a thread-safe holder of the latest successfully fetched Application plus refresh
// health. A failed refresh is recorded but never replaces the data a prior success stored.
type Cache struct {
	mu    sync.RWMutex
	app   toggle.Application
	stats Stats
}

// New returns an empty Cache — no data until the first Update.
func New() *Cache {
	return &Cache{}
}

// Update replaces the cached Application after a successful fetch and resets the failure streak.
func (c *Cache) Update(app toggle.Application) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.app = app
	c.stats.ToggleCount = len(app.Toggles)
	c.stats.LastSuccessAt = time.Now()
	c.stats.ConsecutiveFailures = 0
}

// RecordFailure tracks a failed refresh attempt without touching the cached data.
func (c *Cache) RecordFailure(err error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.stats.LastErrorAt = time.Now()
	c.stats.LastError = err
	c.stats.ConsecutiveFailures++
}

// Get returns the toggle at path plus every ancestor on the way down from the root, root first —
// ok is false only when the target itself was never fetched (a missing ancestor doesn't count).
func (c *Cache) Get(p toggle.Path) (target toggle.Toggle, ancestors []toggle.Toggle, ok bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	target, ok = c.app.ByPath(p)
	if !ok {
		return toggle.Toggle{}, nil, false
	}
	return target, c.app.AncestorsOf(p), true
}

// Stats returns a snapshot of cache health.
func (c *Cache) Stats() Stats {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.stats
}

// Clear discards all cached data and health stats, returning the Cache to its just-New state.
func (c *Cache) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.app = toggle.Application{}
	c.stats = Stats{}
}
