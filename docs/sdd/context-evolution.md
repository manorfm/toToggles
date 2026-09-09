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
| 7 | E2E coverage and final documentation | Planned |

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

- [ ] Add server E2E scenarios for local-rule-only evaluation and hierarchy blocking.
- [ ] Add SDK contract fixtures shared across languages.
- [ ] Publish adapter security guides and migration notes.
- [ ] Run full server, frontend, Go, Node, and Java suites before release.
