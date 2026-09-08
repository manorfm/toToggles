# totoggle-node

[![totoggle-node](https://github.com/manorfm/toToggles/actions/workflows/totoggle-node.yml/badge.svg)](https://github.com/manorfm/toToggles/actions/workflows/totoggle-node.yml)

Node.js/TypeScript client library for [ToToggle](../README.md): fetches an application's toggle
set from the server via a secret key, caches it in memory, and evaluates `isActive`/`isActiveFor`
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

// Forward a parameter to every activation rule in the path — the target's own rule AND every
// ancestor's, not just the leaf's.
if (client.isActiveFor("user.premium.features", "premium")) {
  // premium-only behavior
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
| `refreshIntervalMs` | `300_000` (5m) | How often to re-fetch toggles from the server. |
| `httpTimeoutMs` | `10_000` (10s) | Timeout for a single fetch request. |
| `enableOfflineMode` | `true` | Keep serving the last successfully fetched data when the server becomes unreachable. |
| `timeZone` | the runtime's own zone | IANA zone (e.g. `"America/Sao_Paulo"`) `time` activation rules (`"09:00-18:00"` windows) are evaluated in — the rule is documented as "24h window in server timezone," and a client has no way to know that zone on its own. |

## Cascading validation

`isActive`/`isActiveFor` walk every ancestor from the root down to the requested path — each one
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
| `percentage` | `"0"`-`"100"` | `ToggleContext.rolloutKey`; stable, toggle-specific cohort. Missing key fails closed. |
| `parameter` | comma-separated allowlist | `ToggleContext.parameter`. |
| `user_id` | comma-separated allowlist | `ToggleContext.userId`. |
| `country` | comma-separated allowlist | `ToggleContext.country`, typically an ISO country code. |
| `canary` | comma-separated allowlist | `ToggleContext.cohort`, e.g. `canary` or `beta` (not boolean). |
| `ip` | comma-separated IPv4 addresses and/or CIDR ranges (e.g. `"10.0.0.0/24"`) | `ToggleContext.ip`. |
| `time` | `"HH:mm-HH:mm"`, 24h, overnight-aware | The current time in the configured `timeZone`. Needs no parameter. |

A rule with no context supplied when it needs one, an out-of-range percentage, an
unparseable IP, or a malformed time window all fail closed to `false` rather than throwing — a
feature-flag check should never be able to crash a caller's request path.

## ToggleContextProvider

Contextual rules are local to the requested toggle; ancestor rules never cascade. Configure a
provider from your application's request middleware rather than trusting headers in the SDK:

```ts
const config = createConfig("checkout", "https://toggles.example", "sk_...", {
  contextProvider: {
    getContext: () => ({ rolloutKey: request.user.id, country: request.geo.country, cohort: process.env.DEPLOY_RING }),
  },
});
```

`percentage` requires `rolloutKey` and enables the configured percentage of that stable,
toggle-specific population. `canary` matches a textual `cohort` such as `canary` or `beta`.
`ip`, `country`, `user_id`, and `parameter` use their corresponding context fields. Missing
context or a provider error logs a warning and returns `false`; `isActive` never throws.

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

## Testing

```bash
npm run typecheck
npm test
npm run build
```
