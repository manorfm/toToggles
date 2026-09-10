# Changelog

All notable changes to `totoggle_go` are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/).

## [1.0.0] — Initial public release

First tagged release, published after a full development cycle (19 commits touching this
package — see `git log -- totoggle_go` for the exact history). Reflects a stable, tested public
API considered ready for external consumers.

### Added
- Go client (`New`, `NewConfig`, functional options) that fetches and caches an application's
  toggle catalog from the ToToggle server via a secret key, with `IsActive`/`IsActiveContext`
  evaluating entirely from the local cache.
- All 7 activation rule types (percentage, attribute, user_id, ip, country, time, cohort), with
  cascading ancestor validation matching the server's semantics.
- `httpcontext` package: `net/http` request-context middleware with trusted-proxy (CIDR) support,
  RFC 7239 `Forwarded` handling, and an optional local GeoIP country resolver — all fail-closed.
- Background refresh with exponential backoff + jitter, offline mode, and HTTP `ETag`/
  `If-None-Match` catalog synchronization.
- Observability hooks (`AddMetricsListener`) and health/staleness getters.
- Cross-SDK contract and end-to-end test coverage shared with the Java and Node clients.

### Changed
- Renamed the parameter rule type to `Attribute` and standardized canonical activation
  terminology across all 3 client libraries.
- Migrated to an isolated, canonical per-request context shared across SDK adapters.

### Removed
- The legacy parameter-evaluation API, superseded by `ToggleContextResolver` and the
  `AttributeStrategy`-equivalent rule handling.

### Fixed
- Fail-closed country context resolution when no trusted source is configured.
- Context evaluation, synchronization safety, and IPv6 handling hardened for production use.
