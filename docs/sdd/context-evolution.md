# SDD — Context-aware toggle evaluation

## Specification

### Goal

Keep application code limited to `isActive(path)`. SDKs must evaluate a toggle's local rule
from a middleware-owned, request-local context, never from an argument supplied to `isActive`.

### Rule semantics

- An ancestor contributes only its own `enabled` bit. Its activation rule never affects a child.
- A target is active only when it is enabled, every ancestor is enabled, and its local rule
  matches.
- Rules fail closed when their required context is unavailable or invalid.
- The canonical rule types are `percentage`, `attribute`, `user_id`, `ip`, `country`, `time`,
  and `cohort`.
- `attribute` reads `attributes.<name>`; `parameter` is removed with no compatibility alias.
- `cohort` is textual (`canary`, `beta`, `stable`); boolean values are invalid.

### Context contract

Rules carry a `config.context_key`. SDKs resolve only that key at evaluation time:

```text
rollout_key | user_id | ip | country | cohort | attributes.<name>
```

The core SDK never parses HTTP headers, trusts forwarded addresses, calls GeoIP services, or
reads authentication state. Framework middleware/adapters own extraction and provide a lazy
resolver.

### Security requirements

- Use socket IP by default.
- Honor forwarded IP/country headers only when the direct peer is explicitly trusted.
- Normalize and validate country codes; reject missing or malformed inputs.
- Request context must be scoped and restored after each request; no shared mutable client state.
- No context value, secret, or raw request header is logged by the SDK.

## Plan

| Wave | Deliverable | Status |
|---|---|---|
| 1 | Canonical rule and lazy resolver contract | Complete |
| 2 | Request-local HTTP adapters | Complete |
| 3 | Trusted IP and country extraction | Complete |
| 4 | Non-HTTP identity, cohort, and attributes | Complete |
| 5 | Remove legacy APIs and dead code | Complete |
| 6 | Efficient catalog synchronization | Complete |
| 7 | E2E coverage and final documentation | Complete |
| 8 | Audit remediation: contract, security, and resilience gaps | Complete |

## Tasks

### Wave 1 — Canonical contract

- [x] Server canonicalized `attribute` and validates rule/context-key combinations.
- [x] Node introduced `ToggleContextResolver` and removed `isActiveFor`.
- [x] Go introduced `ToggleContextResolver` and lazy lookup from `IsActiveContext`.
- [x] Java introduced `ToggleContextResolver` and removed the `isActive(path, parameter)` API.
- [x] Remove the legacy parameter API and canonicalize `attribute` across production contracts.
- [x] Add regression coverage for `attribute` and rejection of the removed `parameter` type.

### Wave 2 — HTTP adapters

- [x] Node has an `AsyncLocalStorage` request resolver.
- [x] Go has a `net/http` middleware resolver.
- [x] Java has a thread-bound resolver with scoped restoration tests.
- [x] Provide Node middleware compatible with Express/Fastify request handlers.
- [x] Provide Go `net/http` middleware, reusable by Gin through `c.Request.Context()`.
- [x] Provide Java request-local scope for Servlet filters/interceptors and document its reactive limitation.

### Wave 3 — Network context

- [x] Node and Go default to socket IP and require explicit trusted peers for forwarded headers.
- [x] Node and Go test spoofed forwarded headers and trusted-proxy behavior.
- [x] Support trusted-proxy CIDR allowlists, IPv6, and RFC 7239 `Forwarded` parsing.
- [x] Implement Java trusted-proxy IP/country extraction and tests.
- [x] Add configurable country sources: trusted header, local GeoIP resolver, disabled.

### Wave 4 — Domain context

- [x] Define canonical middleware values: authenticated `user_id`, stable `rollout_key`,
  deployment `cohort`, and `attributes.*`.
- [x] Provide framework-specific middleware examples for those values.
- [x] Add request-concurrency/isolation tests for all SDK adapters.

### Wave 5 — Remove legacy code

- [x] Removed Node `isActiveFor` and Java parameter overload.
- [x] Remove legacy rule-type/API names, files, tests, comments, and docs; retain only explicit
  rejection coverage and textual cohort values such as `canary`.
- [x] Complete Go API/documentation migration and run its full suite.

### Wave 6 — Catalog synchronization

- [x] Add catalog `revision` and `ETag`.
- [x] Implement `If-None-Match`/`304`, jitter, and exponential backoff in every SDK.
- [x] Evaluate SSE with polling fallback; retained authenticated conditional polling because this
  secret-header API cannot offer an equivalent portable SSE credential boundary.

### Wave 7 — Verification and docs

- [x] Add server E2E scenarios for local-rule-only evaluation and hierarchy blocking.
- [x] Add SDK contract fixtures shared across languages.
- [x] Publish adapter security guides and migration notes.
- [x] Run full server, frontend, Go, Node, and Java suites before release.

### Wave 8 — Audit remediation: contract, security, and resilience

All work in this wave follows red-green-blue: introduce the failing regression test first,
implement the smallest safe change, then refactor without reducing coverage.

#### Canonical evaluation contract

- [x] Make Go, Node, and Java reject a catalogue rule when its `type` and `config.context_key`
  are not a canonical pair. Invalid combinations must fail closed before calling a context
  resolver.
- [x] Extend the shared SDK fixture with invalid type/context-key combinations and assert the
  same fail-closed result and zero resolver access in every SDK.
- [x] Add IPv6 literal and IPv6 CIDR matching to IP-rule evaluators in Go, Node, and Java;
  retain IPv4 behavior and malformed-value fail-closed cases.
- [x] Extend trusted-proxy and shared-contract tests to exercise effective IPv6 client addresses
  end to end for every supported adapter.

#### Context confidentiality and lifecycle safety

- [x] Remove raw resolver errors and recovered panic values from Go and Node SDK logs. Emit only
  stable, non-sensitive failure messages while preserving fail-closed evaluation.
- [x] Add log-safety regressions proving `user_id`, IP, country, headers, secret-like values, and
  resolver exception text cannot reach SDK logs.
- [x] Serialize shutdown with an in-flight refresh in Go and Java, preventing cache repopulation,
  late metrics, or a new schedule after shutdown.
- [x] Add deterministic shutdown-during-refresh regressions for Go and Java, including a blocked
  `200` response and an assertion that the cache remains empty after shutdown.

#### Synchronization consistency and maintainability

- [x] Standardize Node retry jitter to the documented `±20%` range used by Go and Java, with
  deterministic lower-, midpoint-, and upper-bound tests.
- [x] Validate and bound server-supplied ETags in Go before caching or sending `If-None-Match`,
  matching Node and Java's defensive behavior; add malformed, control-character, and oversized
  validator tests.
- [x] Correct Java KDoc/examples so they state that ancestors contribute only `enabled`, remove
  the duplicate call-site example, and make the HTTP integration boundary explicit.
- [x] Provide a concrete, optional Java Servlet filter/interceptor adapter (or explicitly scope
  and test a framework-neutral integration module) so request extraction is as transparent as
  the Node and Go middleware paths.

#### Closure criteria

- [x] Run the full server, frontend, E2E, Go race/vet, Node typecheck/build, and Java test suites.
- [x] Perform an independent read-only security and architecture review confirming all Wave 8
  findings are resolved and no raw context or secret data is exposed in SDK logs.
