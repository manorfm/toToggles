package middleware

import "time"

// defaultKillSwitchRateLimiter limits POST /api/toggles/disable per secret key (not per IP —
// the caller is a monitoring/alerting system, not a browser; a legitimate burst of calls during
// a real incident shouldn't be treated as abuse the way login attempts are). More generous than
// LoginRateLimit's 10/15min since this is an operational safety valve, not a human login form.
var defaultKillSwitchRateLimiter = newSlidingWindowLimiter(30, 5*time.Minute)

// AllowKillSwitchRequest reports whether another kill-switch call is allowed for this secret key
// right now (30 calls / 5 min per key). Not a gin.HandlerFunc like LoginRateLimit — the secret
// key isn't known until the handler has already resolved and validated it (there's no prior
// auth middleware step to key a chained rate limiter off of, unlike the login IP, which is
// available before any validation happens), so the handler calls this directly once it has a
// validated key.
func AllowKillSwitchRequest(secretKeyID string) bool {
	return defaultKillSwitchRateLimiter.allow(secretKeyID)
}
