# Changelog

All notable changes to `totoggle_java` are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/).

## [1.0.0] — Initial public release

First tagged release, published after a full development cycle (25 commits touching this
package — see `git log -- totoggle_java` for the exact history), including bug fixes found by
validating the client against the real running server. Reflects a stable, tested public API
considered ready for external consumers.

### Added
- Kotlin/Java client (`ToToggleClient`, `ToToggleConfig.builder()`) that fetches and caches an
  application's toggle catalog from the ToToggle server via a secret key, evaluating `isActive`
  entirely from the local cache.
- All 7 activation rule types (percentage, attribute, user_id, ip, country, time, cohort), with
  cascading ancestor validation matching the server's semantics.
- Secure network context extraction with trusted `Forwarded` header coverage, and request-local
  HTTP middleware adapters.
- Background refresh, offline mode, staleness-aware health checks, and a metrics listener hook.
- Cross-SDK contract and end-to-end test coverage shared with the Go and Node clients.

### Changed
- Replaced the obsolete parameter strategy with `AttributeStrategy` and standardized canonical
  activation terminology across all 3 client libraries.
- Completed context-key evaluation and replaced the `Canary` rule concept with `Cohort`.
- Migrated to an isolated, canonical per-request context shared across SDK adapters.

### Fixed
- Corrected the client against the real public API and rule semantics (found by testing against
  a live server rather than only fixtures).
- Threaded the `isActive()` parameter through ancestor rule evaluation correctly.
- Fail-closed country context resolution when no trusted source is configured.
- Context evaluation, synchronization safety, and IPv6 handling hardened for production use.
