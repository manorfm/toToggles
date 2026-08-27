package toggle

import (
	"encoding/json"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewPath_ValidPath(t *testing.T) {
	p, err := NewPath("service.feature.flag")
	require.NoError(t, err)
	assert.Equal(t, "service.feature.flag", p.String())
}

func TestNewPath_SingleSegment(t *testing.T) {
	p, err := NewPath("service")
	require.NoError(t, err)
	assert.Equal(t, "service", p.String())
}

func TestNewPath_RejectsEmptyString(t *testing.T) {
	_, err := NewPath("")
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrEmptyPath))
}

func TestNewPath_RejectsEmptySegment(t *testing.T) {
	tests := []string{".service", "service.", "service..feature"}
	for _, raw := range tests {
		t.Run(raw, func(t *testing.T) {
			_, err := NewPath(raw)
			require.Error(t, err)
			assert.True(t, errors.Is(err, ErrEmptyPathSegment))
		})
	}
}

func TestPath_Segments(t *testing.T) {
	p, err := NewPath("service.feature.flag")
	require.NoError(t, err)
	assert.Equal(t, []string{"service", "feature", "flag"}, p.Segments())
}

func TestPath_Segments_SingleSegment(t *testing.T) {
	p, err := NewPath("service")
	require.NoError(t, err)
	assert.Equal(t, []string{"service"}, p.Segments())
}

func TestPath_AncestorPaths_ThreeLevels(t *testing.T) {
	p, err := NewPath("t1.t2.t3")
	require.NoError(t, err)

	ancestors := p.AncestorPaths()
	require.Len(t, ancestors, 2)
	assert.Equal(t, "t1", ancestors[0].String())
	assert.Equal(t, "t1.t2", ancestors[1].String())
}

func TestPath_AncestorPaths_SingleSegmentHasNoAncestors(t *testing.T) {
	p, err := NewPath("t1")
	require.NoError(t, err)
	assert.Empty(t, p.AncestorPaths())
}

func TestPath_AncestorPaths_TwoLevels(t *testing.T) {
	p, err := NewPath("t1.t2")
	require.NoError(t, err)

	ancestors := p.AncestorPaths()
	require.Len(t, ancestors, 1)
	assert.Equal(t, "t1", ancestors[0].String())
}

func TestPath_Equal(t *testing.T) {
	a, _ := NewPath("t1.t2")
	b, _ := NewPath("t1.t2")
	c, _ := NewPath("t1.t3")

	assert.Equal(t, a, b)
	assert.NotEqual(t, a, c)
}

func TestPath_JSONRoundTrip(t *testing.T) {
	p, err := NewPath("service.feature.flag")
	require.NoError(t, err)

	data, err := json.Marshal(p)
	require.NoError(t, err)
	assert.Equal(t, `"service.feature.flag"`, string(data))

	var decoded Path
	require.NoError(t, json.Unmarshal(data, &decoded))
	assert.Equal(t, p, decoded)
}

func TestPath_UnmarshalJSON_RejectsInvalidPath(t *testing.T) {
	var p Path
	err := json.Unmarshal([]byte(`""`), &p)
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrEmptyPath))
}
