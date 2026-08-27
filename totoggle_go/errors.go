// Package totoggle is the ToToggle feature-flag client. It fetches the toggle set for one
// application via a secret key, caches it in memory, and evaluates toggles (including
// hierarchical cascading and activation rules) entirely from that cache — no network access on
// the IsActive/IsActiveFor hot path.
package totoggle

import (
	"errors"

	"github.com/manorfm/toToggles/totoggle_go/internal/serverapi"
)

// ErrInvalidConfig is returned by NewConfig when the supplied values fail validation. Use
// errors.Is to check for it; the wrapped message names the specific problem.
var ErrInvalidConfig = errors.New("totoggle: invalid configuration")

// ErrNotStarted is never currently returned (IsActive/IsActiveFor fail closed to false instead,
// so a feature-flag check never needs its own error handling at the call site) — it is exported
// for Refresh, which is a deliberate action a caller can retry, and therefore deserves a real
// error rather than silent failure.
var ErrNotStarted = errors.New("totoggle: client must be started before use")

// ErrAlreadyShutdown is returned by Refresh after Shutdown has been called.
var ErrAlreadyShutdown = errors.New("totoggle: client has been shut down")

// ErrAuthentication is returned by Refresh (and surfaced via RefreshFailureListener) when the
// server rejects the configured secret key. Re-exports internal/serverapi's sentinel — that
// package isn't importable outside this module, so this is the only way a caller can compare
// against it with errors.Is.
var ErrAuthentication = serverapi.ErrAuthentication
