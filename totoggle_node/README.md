# totoggle-node

[![totoggle-node](https://github.com/manorfm/toToggles/actions/workflows/totoggle-node.yml/badge.svg)](https://github.com/manorfm/toToggles/actions/workflows/totoggle-node.yml)

Node.js/TypeScript client library for [ToToggle](../README.md): fetches an application's toggle
set from the server via a secret key, caches it in memory, and evaluates `isActive`
entirely from that cache — no network access on the evaluation hot path. Same product semantics
as [`totoggle_java`](../totoggle_java) and [`totoggle_go`](../totoggle_go), expressed in native
TypeScript/Node idioms (`Promise` instead of exceptions/error returns, typed `Error` subclasses
instead of Go sentinels or Kotlin's checked exceptions, an options object instead of a
builder/functional options, an interface with optional methods instead of Go's 3-interfaces
workaround).

## Install

```bash
npm install totoggle-node
```

Requires Node.js 20+ (uses the native `fetch`/`AbortController` globals). Zero runtime
dependencies.

## Usage

```ts
import { createConfig, ToToggleClient } from "totoggle-node";

const config = createConfig(
  "my-app",
  "https://your-toggle-server.example.com", // no default — point this at your own server
  "sk_your_secret_key_here",
);

const client = new ToToggleClient(config);
await client.start();

if (client.isActive("user.payments.view-table")) {
  // new behavior
}

client.shutdown();
```

The secret key comes from the server: **Applications → (select one) → Generate Secret Key**
(admin/root only). See [`docs/rest-flow.md`](../docs/rest-flow.md) for the full API contract.

## Configuration

`createConfig(applicationName, serverUrl, secretKey, options?)` validates its arguments and
throws `TotoggleConfigError` if something's wrong — a blank field, a secret key not starting with
`sk_`, or a non-positive duration.

| Option | Default | |
|---|---|---|
| `refreshIntervalMs` | `300_000` (5m) | Base delay for a background catalog refresh. Successful refreshes use this delay; failures use bounded exponential backoff with jitter. |
| `httpTimeoutMs` | `10_000` (10s) | Timeout for a single fetch request. |
| `enableOfflineMode` | `true` | Keep serving the last successfully fetched data when the server becomes unreachable. |
| `timeZone` | the runtime's own zone | IANA zone (e.g. `"America/Sao_Paulo"`) `time` activation rules (`"09:00-18:00"` windows) are evaluated in — the rule is documented as "24h window in server timezone," and a client has no way to know that zone on its own. |

## Cascading validation

`isActive` walks every ancestor from the root down to the requested path — each one
must be enabled before the target toggle's own state is checked. Activation rules are evaluated
only for the exact requested toggle:

```
user                       (disabled)
└── user.payments          (enabled)
    └── user.payments.new-ui (enabled)
```

`client.isActive("user.payments.new-ui")` returns `false` here because `user` is disabled, even
though `user.payments.new-ui` itself is enabled.

## Activation rules

All 7 server-defined rule types are supported:

| Type | Rule value | Matched against |
|---|---|---|
| `percentage` | `"0"`-`"100"` | `rollout_key`; stable, toggle-specific cohort. Missing key fails closed. |
| `attribute` | comma-separated allowlist | A configured `attributes.<name>` key. |
| `user_id` | comma-separated allowlist | `user_id`. |
| `country` | comma-separated allowlist | `country`, an ISO alpha-2 code. |
| `cohort` | comma-separated allowlist | `cohort`, e.g. `canary` or `beta` (not boolean). |
| `ip` | comma-separated IPv4/IPv6 addresses and CIDR ranges | `ip`. |
| `time` | `"HH:mm-HH:mm"`, 24h, overnight-aware | The current time in the configured `timeZone`; no context is needed. |

A rule with no context supplied when it needs one, an out-of-range percentage, an
unparseable IP, or a malformed time window all fail closed to `false` rather than throwing — a
feature-flag check should never be able to crash a caller's request path.

## Request context

Contextual rules are local to the requested toggle; ancestor rules never cascade. Configure a
request-local resolver once, then call only `client.isActive(path)` in application code:

```ts
import { createConfig, NodeRequestContextResolver } from "totoggle-node";

const requestContext = new NodeRequestContextResolver({
  trustedProxyAddresses: ["10.0.0.0/24", "2001:db8::/32"],
  countryResolver: localGeoIpLookup,
  values: (request) => ({
    userId: authenticatedUserId(request),
    rolloutKey: authenticatedUserId(request),
    cohort: deploymentCohort,
    attributes: { plan: accountPlan(request) },
  }),
});
const config = createConfig("checkout", "https://toggles.example", "sk_...", {
  contextResolver: requestContext,
});
```

With Express, register the adapter before handlers that call `isActive`:

```ts
app.use(requestContext.expressMiddleware());
```

With Fastify, use its `onRequest` hook; the adapter scopes the context from Fastify's raw Node
request:

```ts
fastify.addHook("onRequest", requestContext.fastifyOnRequest());
```

`country` uses a valid country header only from a trusted peer. Otherwise, or if that header is
missing or invalid, the optional local GeoIP resolver receives the effective client IP. The socket
peer is used directly; `Forwarded` and `X-Forwarded-For` are used only for trusted peers. With no
country source, malformed data, or a resolver error, country rules fail closed. Domain `values`
has only `userId`, `rolloutKey`, `cohort`, and `attributes`; it cannot override `ip` or `country`.
Each request gets an isolated async context, so concurrent requests never share identity or
attribute values.

## Observability

```ts
client.addMetricsListener(myListener); // every method is optional — implement only what you need
```

```ts
interface ToToggleMetricsListener {
  onRefreshSuccess?(toggleCount: number): void;
  onRefreshFailure?(error: Error, consecutiveFailures: number): void;
  onEvaluation?(path: string, result: boolean): void;
}
```

Plus direct getters: `client.isHealthy()` (started, not shut down, has completed a successful
refresh, and that data isn't stale), `client.isStale()`, `client.lastError()`,
`client.lastErrorTime()`, `client.consecutiveFailureCount()`.

`client.refresh()` forces an immediate fetch outside the configured interval and rejects with
whatever error it hit — unlike the background refresh loop (which only records failures for the
getters above), a caller explicitly asking for fresh data now gets a real answer.

## Efficient catalog synchronization

After a successful catalog response, the client retains its HTTP `ETag` and sends it as
`If-None-Match` on the next refresh. A bodyless `304 Not Modified` is a successful refresh: the
last known-good snapshot remains in place, its freshness timestamp is updated, and the failure
backoff resets. A `200` response replaces the snapshot and may include the optional
`application.revision` field for catalog diagnostics; refresh correctness relies on the standard
HTTP `ETag`, not on that revision.

The server must return `ETag` on `200` responses and honor `If-None-Match` with `304` when the
catalog is unchanged. Transient failures never replace cached flags. Instead, they retry with
bounded exponential backoff plus jitter; the normal base delay is restored after either `200` or
`304`.

Polling is the supported synchronization transport. SSE was evaluated but is not exposed by this
secret-header API, because it cannot preserve the same authenticated credential boundary with a
portable client fallback.

## Testing

```bash
npm run typecheck
npm test
npm run build
```
