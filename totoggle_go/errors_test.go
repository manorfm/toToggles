package totoggle

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/manorfm/toToggles/totoggle_go/internal/serverapi"
)

// ErrAuthentication must be the exact value internal/serverapi returns — internal/ is not
// importable outside this module, so callers can only ever compare against this package's
// re-export. If it weren't the same value, errors.Is(err, totoggle.ErrAuthentication) would
// never match a real authentication failure.
func TestErrAuthentication_IsTheServerAPISentinel(t *testing.T) {
	assert.True(t, errors.Is(ErrAuthentication, serverapi.ErrAuthentication))
	assert.Same(t, serverapi.ErrAuthentication, ErrAuthentication)
}

func TestSentinelErrors_AreDistinct(t *testing.T) {
	all := []error{ErrInvalidConfig, ErrNotStarted, ErrAlreadyShutdown, ErrAuthentication}
	for i, a := range all {
		for j, b := range all {
			if i == j {
				continue
			}
			assert.False(t, errors.Is(a, b), "%v should not match %v", a, b)
		}
	}
}
