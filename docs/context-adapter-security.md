# Context adapter security and migration guide

## Purpose

ToToggle keeps feature checks small: application code evaluates only the requested path. Contextual
rules obtain their value from a configured, request-local resolver instead of arguments at every
call site. This is both the supported API shape and a security boundary.

```text
authenticated identity / deployment state ─┐
trusted HTTP transport ────────────────────┼─> request-local resolver ─> isActive(path)
untrusted client input ────────────────────┘       (only the rule's key)
```

The resolver returns the one canonical key declared by the rule: `rollout_key`, `user_id`, `ip`,
`country`, `cohort`, or `attributes.<name>`. A `time` rule has no context key. Rules are evaluated
only for the requested toggle; ancestor toggles contribute their enabled state, not their rules.

## Trust boundaries

### Domain-owned values

Populate `user_id`, `rollout_key`, `cohort`, and `attributes.*` from authenticated application
state or deployment configuration. Do not take them from query parameters, arbitrary request
headers, cookies that have not been authenticated, or a client-supplied request body.

`rollout_key` must be stable for the subject being rolled out to. It is not a request ID and should
not be a secret. `cohort` is textual, such as `beta` or `canary`; it is not a boolean switch.

### Network-owned values

The adapters derive `ip` and `country`; application domain values cannot override either one.
They use the socket peer by default. `Forwarded`, `X-Forwarded-For`, and the configured country
header are accepted only when that direct peer matches an explicit trusted-proxy address or CIDR.

Configure only proxies operated on the application's direct network path. In particular, do not
trust all private ranges merely because a proxy happens to be private: a client that can connect
from that range could otherwise choose its own IP or country. If there is no such trusted proxy,
leave the trusted-proxy list empty and forwarding headers are ignored.

Country values are normalized to ISO 3166-1 alpha-2 codes. When a valid country header is not
available from a trusted peer, an optional local GeoIP resolver receives the effective client IP.
The local resolver must not make network requests on the request path. Missing, malformed,
untrusted, or failed country information is omitted.

### Request-local isolation

Never attach request identity or network values to the shared SDK client. Scope context around one
request and ensure cleanup even when the handler throws:

| SDK | Scope mechanism | Important limit |
|---|---|---|
| Node | `AsyncLocalStorage` via `NodeRequestContextResolver` | Register its Express middleware or Fastify `onRequest` hook before handlers that call `isActive`. |
| Go | `context.Context` via `httpcontext.Resolver.Middleware` | Pass that request context to `IsActiveContext`; `IsActive` deliberately has no request values. |
| Java | `RequestContextResolver` scope around a synchronous filter/MVC request | Do not use its thread-bound resolver for reactive, coroutine, async Servlet, or executor-hopped work. Use a resolver native to that framework instead. |

Each supported adapter snapshots values for the request. Concurrent requests must not share
identity, attribute, IP, or country values.

## Fail-closed behavior

Missing context, malformed values, unavailable GeoIP, resolver exceptions, invalid rules, and an
unavailable or invalid catalogue do not enable a contextual toggle. The check returns `false`.
This protects an endpoint when context cannot be established; it does not replace authorization.
Keep access control independent of a feature flag and do not treat an enabled flag as permission
to access sensitive data.

The SDKs also avoid logging context values, raw request headers, catalogue validators, or secret
keys. Applications should preserve that property in their own adapter and observability code.

## Migration to resolver-based evaluation

There is no compatibility API for contextual values. Move the extraction to middleware and keep
feature checks parameter-free in the application layer.

| SDK | Remove | Use instead |
|---|---|---|
| Node | `isActiveFor(...)` and call-site context arguments | Configure `NodeRequestContextResolver`; call `client.isActive(path)`. |
| Java | `isActive(path, parameter)` | Configure `RequestContextResolver`; call `client.isActive(path)` inside its request scope. |
| Go | Feature-check call sites that pass identity/network data through application helpers | Configure `httpcontext.Resolver`; call `client.IsActiveContext(request.Context(), path)` from HTTP handlers, or `client.IsActive(path)` when no request context is needed. |

Update server rule configuration at the same time:

- Replace the removed `parameter` rule type with `attribute` and use an explicit
  `attributes.<name>` context key.
- Replace boolean cohort conventions with a textual cohort value.
- Do not duplicate the old value extraction at feature-check call sites. A resolver failure is
  intentionally indistinguishable from unavailable context for rule evaluation and fails closed.

See the SDK-specific setup examples in [Go](../totoggle_go/README.md#togglecontextresolver-and-http-middleware),
[Node](../totoggle_node/README.md#request-context), and
[Java](../totoggle_java/README.md#request-context).
