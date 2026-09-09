# totoggle_go

[![totoggle-go](https://github.com/manorfm/toToggles/actions/workflows/totoggle-go.yml/badge.svg)](https://github.com/manorfm/toToggles/actions/workflows/totoggle-go.yml)

Go client library for [ToToggle](../README.md): fetches an application's toggle set from the
server via a secret key, caches it in memory, and evaluates `IsActive`/`IsActiveContext` entirely from
that cache — no network access on the evaluation hot path. Same product semantics as
[`totoggle_java`](../totoggle_java), expressed in native Go idioms (`error` returns instead of
exceptions, functional options instead of a builder, `context.Context` on network operations,
small segregated interfaces instead of one monolithic listener).

## Install

```bash
go get github.com/manorfm/toToggles/totoggle_go
```

## Usage

```go
package main

import (
	"context"
	"log"

	"github.com/manorfm/toToggles/totoggle_go"
)

func main() {
	cfg, err := totoggle.NewConfig(
		"my-app",
		"https://your-toggle-server.example.com", // no default — point this at your own server
		"sk_your_secret_key_here",
	)
	if err != nil {
		log.Fatal(err)
	}

	client := totoggle.New(cfg)
	if err := client.Start(context.Background()); err != nil {
		log.Fatal(err)
	}
	defer client.Shutdown()

	if client.IsActive("user.payments.view-table") {
		// new behavior
	}

}
```

The secret key comes from the server: **Applications → (select one) → Generate Secret Key**
(admin/root only). See [`docs/rest-flow.md`](../docs/rest-flow.md) for the full API contract.

## Configuration

`NewConfig(applicationName, serverURL, secretKey string, opts ...Option) (*Config, error)`
validates its arguments and returns `ErrInvalidConfig` (check with `errors.Is`) if something's
wrong — a blank field, a secret key not starting with `sk_`, or a non-positive duration.

| Option | Default | |
|---|---|---|
| `WithRefreshInterval(time.Duration)` | `5m` | How often to re-fetch toggles from the server. |
| `WithRefreshBackoffMax(time.Duration)` | `16 × RefreshInterval` | Upper bound for exponential retry delays after failed background refreshes. Each delay has bounded ±20% jitter. |
| `WithHTTPTimeout(time.Duration)` | `10s` | Timeout for the whole fetch request. Ignored if `WithHTTPClient` is set. |
| `WithHTTPClient(*http.Client)` | — | Use your own client (shared connection pooling/instrumentation) instead of one built from `WithHTTPTimeout`. |
| `WithOfflineMode(bool)` | `true` | Keep serving the last successfully fetched data when the server becomes unreachable. |
| `WithTimeZone(*time.Location)` | `time.Local` | Zone `time` activation rules (`"09:00-18:00"` windows) are evaluated in — the rule is documented as "24h window in server timezone," and a client has no way to know that zone on its own. |

## Cascading validation

`IsActive`/`IsActiveContext` walk every ancestor from the root down to the requested path — each one
must be enabled before the target toggle's own state is checked. Activation rules are evaluated
only for the exact requested toggle:

```
user                       (disabled)
└── user.payments          (enabled)
    └── user.payments.new-ui (enabled)
```

`client.IsActive("user.payments.new-ui")` returns `false` here because `user` is disabled, even
though `user.payments.new-ui` itself is enabled.

## Activation rules

All 7 server-defined rule types are supported:

| Type | Rule value | Matched against |
|---|---|---|
| `percentage` | `"0"`-`"100"` | `rollout_key`; stable, toggle-specific cohort. Missing key fails closed. |
| `attribute` | comma-separated allowlist | `attributes.<name>`, declared by the rule. |
| `user_id` | comma-separated allowlist | `user_id`. |
| `country` | comma-separated allowlist | `country`, a normalized ISO 3166-1 alpha-2 code. |
| `cohort` | comma-separated allowlist | `cohort`, e.g. `canary` or `beta` (not boolean). |
| `ip` | comma-separated IPv4/IPv6 addresses and/or CIDR ranges (e.g. `"10.0.0.0/24"`) | `ip`. |
| `time` | `"HH:mm-HH:mm"`, 24h, overnight-aware | The current time in the configured `WithTimeZone`. It needs no context key. |

A rule with no context supplied when it needs one, an out-of-range percentage, an
unparseable IP, or a malformed time window all fail closed to `false` rather than erroring — a
feature-flag check should never be able to panic a caller's request path.

## ToggleContextResolver and HTTP middleware

Contextual rules are local to the requested toggle; ancestor rules never cascade. Resolve only
the context key requested by the rule. The included `httpcontext` package reads the socket IP by
default; it honors forwarding and country headers only from configured trusted proxies. It also
accepts an optional local GeoIP resolver, which receives the effective client IP.

`ApplicationValues` is the only application-controlled context surface. It contains an
authenticated `user_id`, stable `rollout_key`, deployment `cohort`, and named `attributes`.
It deliberately cannot set network-owned `ip` or `country`. Return the zero value when identity
is unavailable: a contextual rule then fails closed.

```go
// In the HTTP bootstrap; import net, net/http, and the httpcontext package.
resolver := httpcontext.New(httpcontext.Options{
    TrustedProxyAddresses: []string{"10.0.0.0/24"},
    CountryResolver: func(ip net.IP) (string, bool) {
        return localGeoIP.CountryCode(ip) // no network I/O on the request path
    },
    ApplicationValues: func(r *http.Request) httpcontext.ApplicationValues {
        identity, ok := authenticatedIdentity(r.Context())
        if !ok {
            return httpcontext.ApplicationValues{}
        }
        return httpcontext.ApplicationValues{
            UserID:     identity.ID,
            RolloutKey: identity.AccountID,
            Cohort:     deploymentCohort,
            Attributes: map[string]string{"plan": identity.Plan},
        }
    },
})

cfg, err := totoggle.NewConfig("my-app", "https://your-toggle-server.example.com", "sk_your_secret_key_here",
    totoggle.WithToggleContextResolver(resolver),
)
if err != nil {
    log.Fatal(err)
}
client := totoggle.New(cfg)

handler := authenticationMiddleware(resolver.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    if client.IsActiveContext(r.Context(), "payments.card") {
        // new behavior
    }
})))
http.ListenAndServe(":8080", handler)
```

`country` prefers a valid configured edge header when the direct peer is trusted. Otherwise the
optional local resolver runs with the effective client IP; malformed, unavailable, and disabled
sources fail closed. `ApplicationValues` cannot override `ip` or `country`. Missing context or a
resolver panic returns `false`; evaluation never panics. `authenticationMiddleware` must run
before `resolver.Middleware`, so the resolver receives its trusted identity context. For
request-scoped values call
`client.IsActiveContext(request.Context(), "payments.card")`; `IsActive` uses an empty background
context.

Gin middleware can establish authenticated identity before a small resolver bridge attaches the
request-local context. Import `github.com/gin-gonic/gin` in an application that uses Gin.

```go
router := gin.New()
router.Use(authenticateGin) // writes trusted identity to c.Request.Context()
router.Use(func(c *gin.Context) {
    resolver.Middleware(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
        c.Request = request
        c.Next()
    })).ServeHTTP(c.Writer, c.Request)
})
router.GET("/payments", func(c *gin.Context) {
    if client.IsActiveContext(c.Request.Context(), "payments.card") {
        c.Status(http.StatusNoContent)
        return
    }
    c.Status(http.StatusNotFound)
})

http.ListenAndServe(":8080", router)
```

Each call to the middleware snapshots the values into that request's `context.Context`; values
are never held on the client or shared across concurrent requests.

## Observability

```go
client.AddMetricsListener(myListener) // registers under whichever of the 3 it implements
```

- `RefreshSuccessListener.OnRefreshSuccess(toggleCount int)`
- `RefreshFailureListener.OnRefreshFailure(err error, consecutiveFailures int)`
- `EvaluationListener.OnEvaluation(path string, result bool)`

Plus direct getters: `client.IsHealthy()` (started, not shut down, has completed a successful
refresh, and that data isn't stale), `client.IsStale()`, `client.LastError()`,
`client.LastErrorTime()`, `client.ConsecutiveFailureCount()`.

`client.Refresh(ctx)` forces an immediate fetch outside the configured interval and returns
whatever error it hit — unlike the background refresh loop (which only records failures for the
getters above), a caller explicitly asking for fresh data now gets a real answer.

## Catalog synchronization

After its first successful catalog response, the SDK retains its HTTP `ETag` and sends it as
`If-None-Match` on later fetches. A `304 Not Modified` response is a successful freshness update:
the existing immutable catalog remains in use and the failure streak resets. A `200` response
replaces the catalog and may include the server's optional `application.revision` for diagnostics.
Neither the ETag nor revision is logged by the SDK.

Background refreshes wait for `RefreshInterval` following a `200` or `304`. Consecutive failures
use exponential backoff up to `WithRefreshBackoffMax`, with bounded jitter; a manual `Refresh`
still executes immediately. This protects the toggle service during an outage while preserving
the last known-good catalog for local evaluation.

Polling is the supported synchronization transport. SSE was evaluated but is not exposed by this
secret-header API because it cannot preserve the same authenticated credential boundary with a
portable client fallback.

## Testing

```bash
go vet ./...
go build ./...
go test ./... -race -cover
```
