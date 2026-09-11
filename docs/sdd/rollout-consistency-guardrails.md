# SDD — Rollout consistency guardrails

## Specification

### Problem

Investigation (2026-09-11) confirmed two independent, real consistency gaps around
`percentage`/`cohort` activation rules across multiple service instances and multiple SDKs, on top
of an already-correct design (activation rules never cascade through toggle hierarchy — see
`docs/sdd/context-evolution.md` and `docs/rest-flow.md`):

1. **Cross-SDK bucket parity has no automated enforcement.** `PercentageStrategy.kt`, `percentage.go`,
   and `percentage.ts` all implement the same FNV-1a-based deterministic bucketing
   (`hash(ruleValue + ":" + path + ":" + key) % 10000 / 100`), verified by manual inspection to
   produce bit-identical results today. But `contract/fixtures/sdk-evaluation.json` — the shared
   fixture all three SDKs run in CI (`client_test.go`, `client.test.ts`, `ToToggleClientTest.kt`) —
   has zero `percentage` cases. A future change to any one SDK's hashing (or a well-intentioned
   "cleanup") could silently break the "same user, same result across services" guarantee with
   nothing in CI to catch it.
2. **The rollout-key contract is implicit.** Deterministic bucketing only produces a stable result
   for a given person if the resolved context value is a durable identity (user ID, account ID) —
   not an ephemeral value like a raw IP (NAT, mobile networks, and multi-region egress make this
   change request-to-request) or a per-request token. Nothing today — server-side validation or
   SDK — warns an operator who wires a `percentage`/`cohort` rule's `context_key` to something
   ephemeral. This is the single most common way to defeat the "consistent hashing" guarantee
   without any code being wrong.

A third, structural cause was also confirmed and is **out of scope for a code fix**: catalog
propagation across a fleet is pull-only (`GET /api/toggles` polling with ETag/If-None-Match,
deliberately jittered per instance — see `docs/rest-flow.md` §8 and `context-evolution.md` Wave 6).
There is no push/webhook from server to SDKs; this was a deliberate architectural decision (SSE
evaluated and rejected — a browser-style event stream cannot preserve the secret-key credential
boundary). The only lever available today is the already-configurable `refreshInterval` /
`RefreshInterval` / `refreshIntervalMs`, and the fix here is to document that lever honestly, not
to build new transport.

### Goals

- Lock cross-SDK `percentage` bucketing parity into the shared contract suite so a regression in
  any one SDK fails CI in all of them.
- Make the rollout-key contract ("must be a durable identity, never an ephemeral value") explicit
  in the API contract doc and in every SDK's public documentation.
- Add a non-blocking server-side warning when a `percentage` or `cohort` rule is configured with a
  `context_key` that is a known-ephemeral value (`ip`).
- Document the real propagation-latency trade-off of polling and give operators a concrete,
  actionable configuration recommendation for kill-switch-dependent deployments — no new
  transport, no push infrastructure.

### Non-goals

- No "rollout family" / cross-toggle cohort-nesting mechanism (deliberately excluded — separate
  product decision, not part of this SDD).
- No push/webhook/SSE delivery channel from server to SDKs (already evaluated and rejected;
  revisiting that decision is out of scope here).
- No change to the FNV-1a bucketing algorithm itself — it is already correct and cross-SDK
  identical; this SDD only adds the test that proves it stays that way.

## Plan

| Wave | Deliverable | Status |
|---|---|---|
| 1 | Cross-SDK `percentage` contract coverage | Complete |
| 2 | Rollout-key contract documentation | Complete |
| 3 | Server-side ephemeral-context-key warning | Complete |
| 4 | Propagation-latency documentation and operator guidance | Complete |

## Tasks

### Wave 1 — Cross-SDK `percentage` contract coverage

- [x] Added a `payments.percentage-rollout` toggle (`percentage`, value `"50"`, `context_key:
  "rollout_key"`) and 3 cases to `contract/fixtures/sdk-evaluation.json`: `rollout_key: "user-42"`
  (bucket 4.31, `expected: true`), `rollout_key: "user-7"` (bucket 74.66, `expected: false`), and
  no context at all (`expected: false`, fail-closed). Bucket values computed independently in
  Python against the documented FNV-1a formula before picking the keys, so each sits unambiguously
  on its side of the 50% threshold.
- [x] Confirmed all three fixture runners pick up the new cases with zero runner-specific changes
  — `context` keys map generically to whatever `context_key` the rule under test asks for.
- [x] Ran all three suites: `go test ./...` (Go, incl. the new cases), `npx vitest run
  src/client.test.ts` (Node, 35/35), and `./gradlew test --tests
  "com.totoggle.client.ToToggleClientTest"` under `JAVA_HOME` pinned to JDK 21 (Java, green). All
  three pass identically — that run is the parity proof.

### Wave 2 — Rollout-key contract documentation

- [x] `docs/rest-flow.md` §7: added a callout after the activation-rule-types paragraph explaining
  the deterministic-hashing formula (`rule value + toggle path + resolved context value`), that
  it's bit-identical across all 3 SDKs, and that `context_key` must resolve to a durable identity —
  never a raw IP or other per-request-unstable value — or the guarantee silently breaks.
- [x] Added the matching note to all three SDK docs: `totoggle_java/README.md` (`rolloutKey`
  bullet under "Request context"), `totoggle_go/README.md` and `totoggle_node/README.md` (inline
  in the `percentage` row of the activation-rules table), each at the point an integrator actually
  wires up the resolver.

### Wave 3 — Server-side ephemeral-context-key warning

- [x] **Real discovery during implementation, changed the approach from the original plan**:
  `entity.ActivationRule.validContextKey` (`server/internal/app/domain/entity/activation_rule.go`)
  already restricts `percentage`'s `context_key` to exactly `"rollout_key"` or `"attributes.<name>"`
  — a bare `context_key: "ip"` is *rejected by validation* for `percentage`, and `cohort`'s
  `context_key` is hardcoded to the literal `"cohort"` with no free-text form at all. So the
  originally planned check (`type in {percentage, cohort} && context_key == "ip"`) can **never
  fire** — that exact configuration is already impossible to save. The only real gap is
  `percentage`'s `attributes.<name>` form, where `<name>` is admin-chosen free text the server
  can't otherwise validate the meaning of.
- [x] Implemented as a heuristic over that free-text name instead:
  `ActivationRule.ContextKey()` (parses `config.context_key`, best-effort, never errors) and
  `ActivationRule.HasEphemeralContextKeyRisk()` (only ever true for `percentage` +
  `attributes.<name>`, matching whole tokens — split on non-alphanumeric — against
  `{ip, session, request, token, nonce}`; token match, not substring, so `attributes.recipient_id`
  doesn't false-positive on "ip"). `cohort` can structurally never trigger this. TDD:
  `activation_rule_test.go` (`TestActivationRule_ContextKey`,
  `TestActivationRule_EphemeralContextKeyWarning`).
- [x] `entity.Toggle` gained `RuleContextWarning *string` (`json:"rule_context_warning,omitempty"
  gorm:"-"` — transient, never persisted, never returned except right after a save that triggers
  it). `ToggleUseCase.UpdateToggleWithRule` sets it after a successful `SetActivationRule` when
  `HasEphemeralContextKeyRisk()` is true — never blocks the save. TDD:
  `TestToggleUseCase_UpdateToggleWithRule_EphemeralContextKeyWarning` (usecase, 3 mock-repo cases)
  and `TestAuditIntegration_ToggleRuleSet_WarnsOnEphemeralLookingContextKeyButStillSucceeds`
  (`httptest` + real SQLite, full `PUT /applications/:id/toggles/:toggleId` round trip, asserting
  `200` + the JSON field both when the warning should and shouldn't appear).
- [x] Surfaced in `EditToggleDrawer.tsx`: since the drawer closes immediately after a successful
  save (same as every other post-save flow in this screen), the warning is shown via the existing
  toast system (`useToast()`) rather than an in-drawer notice — no design-graph screen exists for
  this at all, since it's new backend-only behavior with no prototype counterpart (same precedent
  as the pre-existing "(no effect — X is off)" audit suffix). `ToggleDetail` gained the optional
  `rule_context_warning` field. Every existing `EditToggleDrawer.test.tsx` render call needed
  `{ wrapper: ToastProvider }` added (previously absent — `useToast()` throws outside a provider);
  one new test proves the toast appears with the server's message and the save/close flow is
  otherwise unaffected. Full frontend suite (`npm test`, 651 tests) and `npm run build` green
  afterward — note `npm test` (not bare `vitest run`) is required, see `package.json`'s
  `NODE_OPTIONS=--no-experimental-webstorage` (Node's built-in `localStorage` global otherwise
  shadows jsdom's).

### Wave 4 — Propagation-latency documentation and operator guidance

- [x] `docs/rest-flow.md` §8.1: added a callout after the kill-switch response codes stating the
  server-side effect is immediate but each SDK only observes it on its next successful poll,
  bounded by `refreshInterval` (default 5 minutes, independently jittered per instance), with no
  push channel — "up to one `refreshInterval`, not instantaneous."
- [x] Same callout gives the concrete recommendation (15–30s for kill-switch-dependent
  deployments) and names the exact per-SDK knob.
- [x] Added the matching short note at the exact point each SDK's refresh-interval option is
  configured: `totoggle_go/README.md` and `totoggle_node/README.md` (inline in the config-options
  table row) and `totoggle_java/README.md` (inline comment above `.refreshInterval(...)` in the
  client-configuration example).

## Closure criteria

- [x] All three SDK suites green with the new `percentage` contract cases included.
- [x] `docs/rest-flow.md` and all three SDK READMEs updated with the rollout-key contract note and
  the kill-switch propagation-latency note.
- [x] Server returns a non-fatal `rule_context_warning` on `percentage` rule saves whose
  `attributes.<name>` context key looks ephemeral (the originally planned literal `context_key:
  "ip"` check turned out to be unreachable — see Wave 3's discovery note), covered by passing
  regression tests at the usecase and HTTP-integration level, with no change in behavior for valid
  configurations.
- [x] No change to bucketing algorithm behavior, hierarchy/cascade semantics, or any existing
  passing test — full `go test ./...` (server), 3 SDK suites, and frontend `npm test`/`npm run
  build` all green after every wave.
