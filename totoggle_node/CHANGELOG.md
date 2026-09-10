# Changelog

All notable changes to `totoggle-node` are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/).

## [1.0.0] — Initial public release

First tagged release, published after a full development cycle (16 commits touching this
package — see `git log -- totoggle_node` for the exact history). Reflects a stable, tested public
API considered ready for external consumers. Supersedes the `0.1.0` placeholder version that was
never published to the npm registry.

### Added
- TypeScript/Node client (`ToToggleClient`, `createConfig`) that fetches and caches an
  application's toggle catalog from the ToToggle server via a secret key, evaluating `isActive`
  entirely from the local cache. Zero runtime dependencies.
- All 7 activation rule types (percentage, attribute, user_id, ip, country, time, cohort), with
  cascading ancestor validation matching the server's semantics.
- `NodeRequestContextResolver` with trusted-proxy (IPv4 CIDR) support, RFC 7239 `Forwarded`
  header handling, a local GeoIP country source, and Express/Fastify middleware integration.
- Background refresh with exponential backoff + jitter, offline mode, and HTTP `ETag`/
  `If-None-Match` catalog synchronization.
- Observability hooks (`addMetricsListener`) and health/staleness getters.
- Cross-SDK contract and end-to-end test coverage shared with the Go and Java clients.

### Changed
- Migrated to the canonical rule-context contract, removing the legacy parameter-evaluation API.
- Migrated to an isolated, canonical per-request context shared across SDK adapters.

### Removed
- The previous `isActiveFor(...)` API, with no compatibility path — superseded by configuring a
  `contextResolver` once and calling `isActive(path)`.

### Fixed
- Fail-closed country context resolution when no trusted source is configured.
- Context evaluation, synchronization safety, and IPv6 handling hardened for production use.
- A non-deterministic shutdown-race bug caught by the test suite before it ever shipped.
