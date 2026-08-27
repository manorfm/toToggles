package cache

import (
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/manorfm/toToggles/totoggle_go/internal/toggle"
)

func mustPath(t *testing.T, raw string) toggle.Path {
	t.Helper()
	p, err := toggle.NewPath(raw)
	require.NoError(t, err)
	return p
}

func TestCache_Update_StoresApplicationAndRecordsSuccess(t *testing.T) {
	c := New()
	t1 := toggle.Toggle{ID: "1", Path: mustPath(t, "t1"), Enabled: true}

	before := time.Now()
	c.Update(toggle.NewApplication([]toggle.Toggle{t1}))
	after := time.Now()

	stats := c.Stats()
	assert.Equal(t, 1, stats.ToggleCount)
	assert.False(t, stats.LastSuccessAt.Before(before))
	assert.False(t, stats.LastSuccessAt.After(after))
	assert.Zero(t, stats.ConsecutiveFailures)
}

func TestCache_Get_ReturnsTargetAndAncestors(t *testing.T) {
	c := New()
	t1 := toggle.Toggle{ID: "1", Path: mustPath(t, "t1"), Enabled: true}
	t1t2 := toggle.Toggle{ID: "2", Path: mustPath(t, "t1.t2"), Enabled: false}
	c.Update(toggle.NewApplication([]toggle.Toggle{t1, t1t2}))

	target, ancestors, ok := c.Get(mustPath(t, "t1.t2"))
	require.True(t, ok)
	assert.Equal(t, t1t2, target)
	require.Len(t, ancestors, 1)
	assert.Equal(t, t1, ancestors[0])
}

func TestCache_Get_NotFound(t *testing.T) {
	c := New()
	c.Update(toggle.NewApplication(nil))

	_, _, ok := c.Get(mustPath(t, "missing"))
	assert.False(t, ok)
}

func TestCache_Get_BeforeAnyUpdate(t *testing.T) {
	c := New()

	_, _, ok := c.Get(mustPath(t, "t1"))
	assert.False(t, ok)
}

// A failed refresh must never blank out previously-fetched data — stale-but-present beats empty.
func TestCache_RecordFailure_KeepsPriorDataAndTracksFailure(t *testing.T) {
	c := New()
	t1 := toggle.Toggle{ID: "1", Path: mustPath(t, "t1"), Enabled: true}
	c.Update(toggle.NewApplication([]toggle.Toggle{t1}))

	failErr := errors.New("server unreachable")
	c.RecordFailure(failErr)
	c.RecordFailure(failErr)

	target, _, ok := c.Get(mustPath(t, "t1"))
	require.True(t, ok)
	assert.Equal(t, t1, target)

	stats := c.Stats()
	assert.Equal(t, 2, stats.ConsecutiveFailures)
	assert.Equal(t, failErr, stats.LastError)
	assert.False(t, stats.LastErrorAt.IsZero())
}

func TestCache_Update_ResetsConsecutiveFailures(t *testing.T) {
	c := New()
	c.RecordFailure(errors.New("boom"))
	c.RecordFailure(errors.New("boom"))

	c.Update(toggle.NewApplication(nil))

	assert.Zero(t, c.Stats().ConsecutiveFailures)
}

func TestCache_Clear_RemovesDataAndResetsStats(t *testing.T) {
	c := New()
	t1 := toggle.Toggle{ID: "1", Path: mustPath(t, "t1"), Enabled: true}
	c.Update(toggle.NewApplication([]toggle.Toggle{t1}))
	c.RecordFailure(errors.New("boom"))

	c.Clear()

	_, _, ok := c.Get(mustPath(t, "t1"))
	assert.False(t, ok)
	assert.Equal(t, Stats{}, c.Stats())
}

func TestCache_ConcurrentAccess(t *testing.T) {
	c := New()
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(3)
		go func() {
			defer wg.Done()
			c.Update(toggle.NewApplication([]toggle.Toggle{{ID: "1", Path: mustPath(t, "t1")}}))
		}()
		go func() {
			defer wg.Done()
			c.Get(mustPath(t, "t1"))
		}()
		go func() {
			defer wg.Done()
			c.RecordFailure(errors.New("boom"))
		}()
	}
	wg.Wait()
}
