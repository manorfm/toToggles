package toggle

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func mustPath(t *testing.T, raw string) Path {
	t.Helper()
	p, err := NewPath(raw)
	require.NoError(t, err)
	return p
}

// The user's own t1.t2.t3 hierarchy example: querying the leaf must surface every ancestor on the
// way down from the root, root-first — this is the exact cascade Application.AncestorsOf owns so
// the client's hierarchical evaluation isn't reimplementing path-walking itself.
func TestApplication_AncestorsOf_ThreeLevelHierarchy(t *testing.T) {
	t1 := Toggle{ID: "1", Path: mustPath(t, "t1"), Enabled: true}
	t1t2 := Toggle{ID: "2", Path: mustPath(t, "t1.t2"), Enabled: true}
	t1t2t3 := Toggle{ID: "3", Path: mustPath(t, "t1.t2.t3"), Enabled: true}

	app := NewApplication([]Toggle{t1, t1t2, t1t2t3})

	ancestors := app.AncestorsOf(mustPath(t, "t1.t2.t3"))
	require.Len(t, ancestors, 2)
	assert.Equal(t, t1, ancestors[0])
	assert.Equal(t, t1t2, ancestors[1])
}

func TestApplication_AncestorsOf_RootHasNoAncestors(t *testing.T) {
	t1 := Toggle{ID: "1", Path: mustPath(t, "t1"), Enabled: true}
	app := NewApplication([]Toggle{t1})

	assert.Empty(t, app.AncestorsOf(mustPath(t, "t1")))
}

// A segment missing from the fetched set (never configured, or filtered out server-side) never
// affects the result — it's simply absent from the cascade rather than an error.
func TestApplication_AncestorsOf_SkipsMissingAncestors(t *testing.T) {
	t1 := Toggle{ID: "1", Path: mustPath(t, "t1"), Enabled: true}
	t1t2t3 := Toggle{ID: "3", Path: mustPath(t, "t1.t2.t3"), Enabled: true}
	app := NewApplication([]Toggle{t1, t1t2t3})

	ancestors := app.AncestorsOf(mustPath(t, "t1.t2.t3"))
	require.Len(t, ancestors, 1)
	assert.Equal(t, t1, ancestors[0])
}

func TestApplication_ByPath_Found(t *testing.T) {
	t1t2 := Toggle{ID: "2", Path: mustPath(t, "t1.t2"), Enabled: true}
	app := NewApplication([]Toggle{t1t2})

	found, ok := app.ByPath(mustPath(t, "t1.t2"))
	require.True(t, ok)
	assert.Equal(t, t1t2, found)
}

func TestApplication_ByPath_NotFound(t *testing.T) {
	app := NewApplication(nil)

	_, ok := app.ByPath(mustPath(t, "missing"))
	assert.False(t, ok)
}
