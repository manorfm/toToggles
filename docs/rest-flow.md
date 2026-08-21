# REST Flow - API Contract

This document describes the REST API exposed by the ToToggle server (`server/`), a Go/Gin feature-flag
(feature toggle) management platform with hierarchical toggles, team-based access control and an optional
approval workflow.

Use it as a practical contract for agents and clients that need to create, maintain and read applications,
toggles, teams, users and approval requests. The server runs on `http://localhost:3056` by default and also
serves the bundled frontend (`static/`) and a public secret-key API.

## How the API is organized

The service has four functional areas:

- Identity & Access: authentication, users and profile.
- Governance: teams, team membership, application/team permissions, and the optional approval workflow.
- Catalog: applications and hierarchical toggles (the core feature-flag data).
- Public API: read-only toggle access via secret key, meant for external services (SDKs/clients) that must
  not hold a user session.

Recommended setup order:

1. Log in as the bootstrap `root` user and change its password (forced on first login).
2. Create teams.
3. Create users (root only) and add them to teams.
4. Create an application (it must be bound to an existing team on creation).
5. Create toggles inside the application, using dot-separated hierarchical paths.
6. Optionally generate a secret key for the application to expose toggles to external/public consumers.
7. Optionally enable the approval workflow, configure which actions require approval, and assign team
   approvers.

Main vocabulary:

- Application: a container for a tree of feature toggles. Always owned by exactly one team.
- Toggle: a node in a hierarchical, dot-separated path (e.g. `user.payments.view-table`). Children inherit
  their parent's enabled state — a disabled parent makes every descendant effectively disabled even if the
  descendant's own `enabled` flag is `true`.
- Activation rule: an optional extra condition attached to a toggle (`percentage`, `parameter`, `user_id`,
  `ip`, `country`, `time`, `canary`) layered on top of the enabled/disabled state.
- Team: a group of users. Owns applications through a permission (`read`, `write`, `admin`) and can have
  members marked as approvers for the approval workflow.
- Secret key: an application-scoped credential (`sk_...`) that lets external callers fetch all toggles for
  that application without a user session.
- Approval request: a pending copy of a mutating request, created automatically instead of executing the
  action when the approval workflow is enabled and configured to cover that action type.

## Shared conventions

IDs are ULIDs serialized as strings (26 uppercase alphanumeric characters, e.g. `01ARZ3NDEKTSV4RRFFQ69G5FAV`).

Most routes require a session token, sent either as an HTTP-only cookie (`auth_token`, set automatically by
`POST /auth/login`) or as a bearer header for API clients that cannot use cookies:

```http
Authorization: Bearer <token>
```

The token is an opaque string in the form `token_<userID>` (not a signed JWT despite the internal naming) — it
is only resolvable server-side against the user table, so it is not a general-purpose bearer credential and
must be treated as a session secret.

> **Cross-origin caveat:** the `auth_token` cookie is set with `SameSite=Strict`
> (`auth_handler.go`), so browsers will never send it on requests originating from a different
> origin than the API — same-origin only (e.g. a frontend served from this server's own
> `static/` bundle). The Bearer alternative is **not actually usable as a substitute today**:
> `POST /auth/login`'s JSON response never populates its `token` field on a successful login —
> the token only ever reaches the client via the cookie. Practically, this means a frontend
> hosted on its own origin/dev-server (typical for a separately built SPA) currently has **no
> working way to authenticate** against this API. Building such a frontend requires either
> serving it from the same origin as the API, or a backend change (return the token in the
> login response body, and/or relax `SameSite`) before a Bearer-based flow is possible.

The public toggle-read endpoint uses a different credential instead of a session:

```http
X-API-Key: sk_<...>
```

### Roles and access control

Three roles exist, checked directly from the authenticated user record (no per-request claims payload):

- `root`: super-admin. Only role that can manage users, teams, team-application/user associations, and
  approval settings/approvers. Always bypasses the approval workflow.
- `admin`: can create/update most catalog data (applications, toggles, secret keys) subject to the approval
  workflow when enabled.
- `user`: read-only on catalog data.

Route protection is layered:

- `ValidateToken()`: requires a valid session; also blocks access (except to `/auth/change-password` and
  `/change-password`) and returns `412 Precondition Required` if the user's `must_change_password` flag is
  set.
- `RequireRoot()` / `RequireAdmin()`: hard role checks (`403 Forbidden` if not met), used for user management,
  team management and secret-key management.
- `RequireApprovalAware(minRole)`: used for application and toggle mutations. Behavior:
  - `root` users always pass through immediately.
  - If the approval workflow is disabled, or enabled but not configured to require approval for the inferred
    action type, it falls back to a plain role check against `minRole` (`admin` or `root` for all current
    usages).
  - If the workflow is enabled and required for that action type, the handler is **not** invoked. Instead the
    middleware captures the request body, infers `action_type` from the HTTP method + path, resolves a team
    (via the application's team, or the user's first team for application-create), creates a pending
    `ApprovalRequest`, and responds `202 Accepted` with `{"approval_required": true, "action_type": "..."}`.
    The original write only happens later, when someone calls
    `POST /approval/requests/{id}/execute` after the request is approved.

Common HTTP statuses:

- `200 OK`: resource returned or updated.
- `201 Created`: resource created.
- `202 Accepted`: write intercepted and turned into a pending approval request (see above).
- `204 No Content`: not used by this API — deletes return `200 OK` with a message body instead.
- `400 Bad Request`: validation error, malformed body, or a business-rule rejection.
- `401 Unauthorized`: missing/invalid/expired token.
- `403 Forbidden`: authenticated but not authorized for this action.
- `404 Not Found`: resource does not exist (or does not belong to the given parent, e.g. a toggle requested
  under the wrong application ID).
- `409 Conflict`: **only** used by `POST /applications` for a duplicate application name
  (`application_handler.go`, when `CreateApplication` returns `ErrCodeAlreadyExists`). Every other
  "already exists" condition elsewhere in the API (toggles, teams, users, team memberships,
  team/application associations) is reported as `400` with `ErrCodeAlreadyExists` instead — this
  is the one exception, so don't treat 400-vs-409 as a reliable global signal.
- `412 Precondition Required`: password change required before the request can proceed.
- `500 Internal Server Error`: unexpected/database error.

Standard error body (most handlers; some legacy handlers use a simpler `{"error": "..."}` shape noted inline):

```json
{
  "code": "T0001",
  "message": "validation failed",
  "details": [
    { "field": "name", "message": "Application name is required" }
  ]
}
```

Error codes: `T0001` validation, `T0002` not found, `T0003` already exists, `T0004` database error, `T0005`
internal error, `T0006` invalid path, `T0007` invalid toggle.

## Quick endpoint index

```http
# Health (no auth)
GET  /health
GET  /ready

# Auth (no auth, except change-password)
POST /auth/login
POST /auth/logout
GET  /auth/check-first-access
POST /auth/change-password              # requires session
POST /auth/change-password-first-time   # uses temporary password_change_token cookie or body user_id/username

# Public toggle API (secret key, header X-API-Key)
GET /api/toggles

# Applications (session required)
POST   /applications                          # approval-aware, min role admin
GET    /applications                          # filtered by team membership unless root
GET    /applications/:id
PUT    /applications/:id                      # approval-aware, min role admin
DELETE /applications/:id                      # approval-aware, min role root
POST   /applications/:id/generate-secret      # admin/root only
GET    /applications/:id/secret-keys          # admin/root only

# Toggles (session required)
POST   /applications/:id/toggles                       # approval-aware, min role admin
GET    /applications/:id/toggles                       # ?hierarchy=true for tree view
GET    /applications/:id/toggles/:toggleId
PUT    /applications/:id/toggles/:toggleId              # approval-aware, min role admin
DELETE /applications/:id/toggles/:toggleId              # approval-aware, min role admin
PUT    /applications/:id/toggle/:toggleId                # recursive enable/disable, approval-aware, min role admin

# Secret keys management (session required, admin/root only)
DELETE /secret-keys/:id

# User management (session required, root only)
POST   /users
GET    /users
GET    /users/:id
PUT    /users/:id
DELETE /users/:id

# Current user profile (session required, any role)
GET  /profile
POST /profile/change-password
GET  /profile/teams

# Team management (session required, root only)
POST   /teams
GET    /teams
GET    /teams/:id
PUT    /teams/:id
DELETE /teams/:id
POST   /teams/:id/users
DELETE /teams/:id/users/:user_id
GET    /teams/:id/users
POST   /teams/:id/applications
DELETE /teams/:id/applications/:app_id
PUT    /teams/:id/applications/:app_id
GET    /teams/:id/applications
POST   /teams/:id/approvers/:user_id
GET    /teams/:id/approvers

# Approval workflow (session required)
GET  /approval/settings                     # root only
PUT  /approval/settings                     # root only
GET  /approval/enabled
GET  /approval/required?action_type=...
POST /approval/requests
GET  /approval/requests
GET  /approval/requests/pending
GET  /approval/requests/my
GET  /approval/requests/approvable
GET  /approval/requests/:id
POST /approval/requests/:id/approve
POST /approval/requests/:id/reject
POST /approval/requests/:id/execute
GET  /approval/teams/:id/requests
GET  /approval/stats
GET  /approval/teams/:id/stats
POST /approval/mark-expired                 # root only
GET  /approval/my-approver-teams
```

## 1. Health

No authentication required (used for k8s liveness/readiness probes).

```http
GET /health
```

```json
{ "status": "healthy", "service": "totoogle" }
```

```http
GET /ready
```

Pings the database. Returns `200` with `{"status":"ready","service":"totoogle"}` or `503` with
`{"status":"not ready","reason":"..."}` if the database is unreachable.

## 2. Authentication

```http
POST /auth/login
```

```json
{ "username": "root", "password": "changeme" }
```

Two outcomes:

- Normal login: sets an `auth_token` HTTP-only cookie (7-day expiry) and returns
  `{"success": true, "user": {"id": "...", "username": "...", "role": "root", "must_change_password": false}}`.
- First-login / forced reset (`must_change_password = true` on the user): does **not** issue `auth_token`.
  Instead it sets a short-lived `password_change_token` cookie (1 hour) and returns
  `{"success": true, "must_change_password": true, "user_id": "...", "username": "..."}`. The client must then
  call `change-password-first-time`.

```http
POST /auth/logout
```

Clears the `auth_token` cookie. Returns `{"success": true, "message": "Logged out successfully"}`.

```http
GET /auth/check-first-access
```

Returns `{"first_access": true, "user_count": 0}` when no users exist yet — used by the frontend to decide
whether to show a bootstrap flow. In practice a `root` user with a random password is always created on server
startup (see `InitializeRootUser`), so `first_access` is really "have you completed the forced root password
change".

```http
POST /auth/change-password-first-time
```

```json
{
  "current_password": "temporary-generated-password",
  "new_password": "newSecret123"
}
```

`user_id`/`username` are optional in the body; if omitted they are read from the `password_change_token`
cookie set during login. Fails with `400` if the target user's `must_change_password` is already `false`.

```http
POST /auth/change-password
```

Requires a valid session (`ValidateToken()`); routed to the same profile handler as
`POST /profile/change-password` (see §5).

## 3. User Management (Root Only)

Only `root` can create, list, update or delete users. Regular admins cannot self-register other admins.

```http
POST /users
```

```json
{ "username": "alice", "role": "admin" }
```

Rules:

- `role` must be `"admin"` or `"user"` — `"root"` is rejected (`400`, "Cannot create additional root users").
- No password is supplied by the caller: the server generates a random one and forces `must_change_password =
  true`. The response is the only place the plaintext password is returned, so it must be captured immediately.

Response (`201`):

```json
{
  "success": true,
  "user": {
    "id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "username": "alice",
    "role": "admin",
    "must_change_password": true,
    "created_at": "2026-08-19T10:00:00Z",
    "updated_at": "2026-08-19T10:00:00Z"
  },
  "password": "Xk9$mQ2pLw#T"
}
```

Read/delete:

```http
GET    /users
GET    /users/:id
DELETE /users/:id
```

`DELETE` refuses to remove a `root` user (`403`), and refuses to let a `root` user delete their own account
(`403`).

```http
PUT /users/:id
```

```json
{
  "role": "admin",
  "teams_to_add": ["01TEAM000000000000000001"],
  "teams_to_remove": ["01TEAM000000000000000002"]
}
```

Rules:

- `role` accepts `"admin"`, `"user"`, or `"root"`. Assigning `"root"` is only allowed when the caller **is**
  root and is editing their **own** account. Changing the role of an existing `root` user to anything else is
  blocked unless the caller is that same root user.
- Team associations are applied best-effort: failures per team (e.g. already a member) are collected into a
  non-fatal `team_warnings` array rather than failing the whole request.

Response wraps the updated user (with refreshed `teams`) plus optional warnings:

```json
{
  "success": true,
  "message": "User updated successfully",
  "user": { "id": "...", "username": "alice", "role": "admin", "teams": [] },
  "team_warnings": ["Failed to add to team 01TEAM...: team not found"]
}
```

## 4. Current User Profile (Any Authenticated Role)

```http
GET /profile
```

```json
{
  "success": true,
  "user": {
    "id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "username": "alice",
    "role": "admin",
    "must_change_password": false,
    "created_at": "2026-08-19T10:00:00Z",
    "updated_at": "2026-08-19T10:00:00Z"
  }
}
```

```http
POST /profile/change-password
```

```json
{ "current_password": "old", "new_password": "newSecret123" }
```

Verifies `current_password` against the stored hash, sets the new password, and clears
`must_change_password`. `400` if the new password is under 4 characters; `401` if `current_password` is wrong.

```http
GET /profile/teams
```

Returns the caller's own team memberships: `{"success": true, "teams": [...]}` (`entity.Team[]`).

## 5. Team Management (Root Only)

```http
POST /teams
```

```json
{ "name": "Payments Squad", "description": "Owns payments features" }
```

Rules: `name` 2–100 chars and globally unique; `description` up to 500 chars.

```http
GET    /teams
GET    /teams/:id
PUT    /teams/:id
DELETE /teams/:id
```

`GET /teams` returns `TeamWithCounts[]` (adds `user_count` / `application_count`); `GET /teams/:id` returns the
full `Team` with nested `users`/`applications` when loaded.

```json
{
  "success": true,
  "team": {
    "id": "01TEAM000000000000000001",
    "name": "Payments Squad",
    "description": "Owns payments features",
    "created_at": "2026-08-19T10:00:00Z",
    "updated_at": "2026-08-19T10:00:00Z"
  }
}
```

### Team membership

```http
POST   /teams/:id/users
```

```json
{ "user_id": "01ARZ3NDEKTSV4RRFFQ69G5FAV" }
```

Rejects with `400` if the user is already a member.

```http
DELETE /teams/:id/users/:user_id
GET    /teams/:id/users
```

### Team ↔ application permissions

```http
POST /teams/:id/applications
```

```json
{ "application_id": "01APP0000000000000000001", "permission": "write" }
```

`permission` is one of `read`, `write`, `admin`. Rejects with `400` if the application is already associated
with this team (an application can belong to more than one team, each with its own permission level).

```http
DELETE /teams/:id/applications/:app_id
```

```http
PUT /teams/:id/applications/:app_id
```

```json
{ "permission": "admin" }
```

Requires the association to already exist (`400` otherwise).

```http
GET /teams/:id/applications
```

### Team approvers

See §8.3 — approver assignment lives under `/teams/:id/approvers/:user_id` but is implemented by the approval
handler/use case, not the team use case.

## 6. Applications

```http
POST /applications
```

Approval-aware, minimum role `admin` when the approval workflow does not intercept it.

```json
{ "name": "Checkout Web", "team_id": "01TEAM000000000000000001" }
```

Rules:

- `name`: required, ≤255 chars, only letters/digits/spaces/`-`/`_`/`.`, no `<>"'&`.
- `team_id`: required — every application must be created already bound to one team, with that team receiving
  `admin` permission automatically. If the team association fails, the just-created application is deleted
  again (best-effort compensation) and `400` is returned.

Response (`201`) is the raw `Application` entity:

```json
{
  "id": "01APP0000000000000000001",
  "name": "Checkout Web",
  "created_at": "2026-08-19T10:00:00Z",
  "updated_at": "2026-08-19T10:00:00Z"
}
```

```http
GET /applications
```

Visibility is filtered server-side by role: `root` sees every application; `admin`/`user` see only
applications belonging to a team they are a member of. Response items are `ApplicationWithCounts`:

```json
[
  {
    "id": "01APP0000000000000000001",
    "name": "Checkout Web",
    "created_at": "2026-08-19T10:00:00Z",
    "updated_at": "2026-08-19T10:00:00Z",
    "toggles_total": 12,
    "toggles_enabled": 9,
    "toggles_disabled": 3
  }
]
```

```http
GET /applications/:id
```

Adds the application's associated `teams`:

```json
{
  "id": "01APP0000000000000000001",
  "name": "Checkout Web",
  "created_at": "2026-08-19T10:00:00Z",
  "updated_at": "2026-08-19T10:00:00Z",
  "teams": [{ "id": "01TEAM000000000000000001", "name": "Payments Squad" }]
}
```

```http
PUT /applications/:id
```

Approval-aware, minimum role `admin`.

```json
{ "name": "Checkout Web v2", "team_id": "01TEAM000000000000000002" }
```

`team_id` is optional. When present, the application is **moved**: it is removed from every team it currently
belongs to and re-associated with the new team at `admin` permission (this is a full replace, not an add).

```http
DELETE /applications/:id
```

Approval-aware, minimum role `root` (the strictest mutation in the API). Cascades: deletes every toggle under
the application before deleting the application itself. Response: `{"message": "application deleted
successfully"}`.

## 7. Toggles

Toggles are addressed two ways: by dot-separated `path` (used only for creation) and by `id` (used for every
other operation, always scoped to the `:id` application in the URL — a toggle ID that belongs to a different
application resolves as a validation error, not `404`).

```http
POST /applications/:id/toggles
```

Approval-aware, minimum role `admin`.

```json
{ "toggle": "user.payments.view-table" }
```

Rules and behavior:

- `toggle` must pass path validation: non-empty, ≤1000 chars, no leading/trailing dot, no consecutive dots,
  each dot-separated segment matches `^[a-zA-Z0-9\-_]+$`.
- Rejects with `400`/`ErrCodeAlreadyExists` if the exact final path already exists.
- Creates the **entire missing chain** of ancestors automatically. Every intermediate segment that does not
  yet exist is created with `enabled = true`; only the final (leaf) segment is created enabled — the endpoint
  has no `enabled` input, so a freshly created toggle is always enabled by default and must be disabled with a
  follow-up update if needed.
- Segments that already exist are reused as the parent for the next segment instead of erroring.

Response (`201`):

```json
{ "message": "toggle created successfully", "path": "user.payments.view-table", "enabled": true }
```

```http
GET /applications/:id/toggles
GET /applications/:id/toggles?hierarchy=true
```

Two shapes:

- Flat (default): array of full `Toggle` entities (id, value, enabled, path, level, parent_id, app_id,
  has_activation_rule, activation_rule, created_at, updated_at, plus one level of preloaded `parent`/
  `children`).
- Hierarchy (`?hierarchy=true`): nested tree, one root node per top-level segment. `enabled` on every node is
  pre-computed as `own_enabled AND parent_enabled` recursively, so clients don't need to walk up the tree
  themselves; `value` on non-root nodes is only the segment name, not the full path; a node only has a
  `toggles` array key when it has children.

```json
{
  "application": "01APP0000000000000000001",
  "toggles": [
    {
      "id": "01TGL0000000000000000001",
      "value": "user",
      "enabled": true,
      "toggles": [
        {
          "id": "01TGL0000000000000000002",
          "value": "payments",
          "enabled": true,
          "toggles": [
            { "id": "01TGL0000000000000000003", "value": "view-table", "enabled": false }
          ]
        }
      ]
    }
  ]
}
```

```http
GET /applications/:id/toggles/:toggleId
```

Returns the raw `Toggle` entity (own `enabled` value — not hierarchy-resolved; combine with parent traversal
or use the hierarchy endpoint if the effective state is needed).

```http
PUT /applications/:id/toggles/:toggleId
```

Approval-aware, minimum role `admin`. Full replace of the toggle's own `enabled` flag and activation rule —
**not** recursive (children are untouched; compare with §7's `PUT /toggle/:toggleId` below).

```json
{
  "enabled": true,
  "has_activation_rule": true,
  "activation_rule": {
    "type": "percentage",
    "value": "25",
    "config": null
  }
}
```

Activation rule types (`type`) and their required `value` semantics: `percentage` (0–100 rollout), `parameter`
(match against a supplied parameter), `user_id`, `ip`, `country`, `time`, `canary` — every type requires a
non-empty `value`; `config` is a free-form JSON blob for type-specific extra settings. When
`has_activation_rule` is `false`, any `activation_rule` in the body is ignored and the toggle's rule is
cleared.

Response: the updated `Toggle` entity.

```http
DELETE /applications/:id/toggles/:toggleId
```

Approval-aware, minimum role `admin`. Important nuance: **a toggle with children is not deleted** — the call
still returns `200 OK` with a success message, but the toggle silently survives if it has descendants (the
handler has no way to signal "not deleted" back to the caller, so clients should re-fetch to confirm).
When the toggle has no children, it is removed, and then the parent is checked recursively: if removing this
toggle leaves its parent with no other children, the parent is deleted too (bubbling cleanup up the chain),
and so on, until a parent with remaining children or a root is reached.

```http
PUT /applications/:id/toggle/:toggleId
```

Note the **singular** `toggle` in the path — this is a distinct, more powerful endpoint. Approval-aware,
minimum role `admin`.

```json
{ "enabled": false }
```

Recursively sets `enabled` on the target toggle **and every descendant**, in a single call — the intended way
to disable/enable an entire subtree at once (e.g. kill-switching `user.payments.*`). Response is the refreshed
target `Toggle`.

## 8. Public API (Secret Keys)

Secret keys let a service fetch an application's toggles without a user session — meant for SDK/client
integrations (see the top-level project README for the companion Java/Kotlin client).

```http
POST /applications/:id/generate-secret
```

Admin/root only (not approval-aware). "Generate" is really "regenerate": **every existing secret key for the
application is deleted first**, then exactly one new key named `"API Access Key"` is created. There is no way
to have multiple concurrently valid keys per application through this endpoint.

```json
{
  "success": true,
  "secret_key": {
    "id": "01SK00000000000000000001",
    "name": "API Access Key",
    "application_id": "01APP0000000000000000001",
    "created_by": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "created_at": "2026-08-19T10:00:00Z",
    "updated_at": "2026-08-19T10:00:00Z"
  },
  "plain_key": "sk_9f1c...redacted...",
  "warning": "This key will only be shown once. Please store it securely."
}
```

`plain_key` is never persisted or retrievable again — only its SHA-256 hash is stored (`key_hash`, which is
never serialized in any response).

```http
GET /applications/:id/secret-keys
```

Admin/root only. Lists key metadata (no plaintext, no hash) for the application.

```http
DELETE /secret-keys/:id
```

Admin/root only.

```http
GET /api/toggles
```

No session — authenticate via header:

```http
X-API-Key: sk_9f1c...
```

`404` if the key is unknown; otherwise returns the owning application plus a simplified toggle list (no nested
`parent`/`children` objects — just `id`, `value`, `enabled`, `path`, `level`, `parent_id`, `app_id`,
`has_activation_rule`, `activation_rule`):

```json
{
  "application": {
    "id": "01APP0000000000000000001",
    "name": "Checkout Web",
    "toggles": [
      {
        "id": "01TGL0000000000000000001",
        "value": "user",
        "enabled": true,
        "path": "user",
        "level": 0,
        "parent_id": null,
        "app_id": "01APP0000000000000000001",
        "has_activation_rule": false,
        "activation_rule": null
      }
    ]
  }
}
```

Note this endpoint returns each toggle's own `enabled` value, not the hierarchy-resolved effective value —
consumers that need cascading behavior must apply it client-side (parent disabled ⇒ treat descendants as
disabled), matching the client library's documented cascading-validation behavior.

## 9. Approval Workflow

An optional governance layer, off by default, that can force selected mutation types (per action type) to go
through a two-step propose → approve → execute flow instead of applying immediately. Root users are always
exempt and can act directly regardless of settings.

### 9.1 Settings (Root Only)

```http
GET /approval/settings
```

```json
{
  "message": "approval settings retrieved successfully",
  "data": {
    "id": "01SET00000000000000000001",
    "approval_enabled": false,
    "required_actions": {
      "toggle_create": false,
      "toggle_update": false,
      "toggle_delete": true,
      "toggle_enable": false,
      "toggle_disable": false,
      "toggle_rule": true,
      "application_create": true,
      "application_delete": true,
      "secret_key_create": true,
      "secret_key_delete": true
    },
    "default_expiration_days": 7,
    "created_at": "2026-08-19T10:00:00Z",
    "updated_at": "2026-08-19T10:00:00Z"
  }
}
```

These are the defaults seeded on first run: the workflow itself is disabled, but if it were enabled, deletes
and rule changes on toggles plus all application/secret-key mutations would already require approval.

```http
PUT /approval/settings
```

Root only. All fields optional — partial patch (only supplied keys are applied):

```json
{
  "approval_enabled": true,
  "required_actions": { "toggle_delete": true, "application_delete": true },
  "default_expiration_days": 14
}
```

`default_expiration_days` must be between 1 and 30. Note `required_actions`, when present, is set wholesale
(all ten booleans), so clients should send the complete config object, not just the keys they want to flip.

In practice, only these action types can actually be intercepted end-to-end by the middleware today:
`toggle_create`, `toggle_update`, `toggle_delete`, `application_create`, `application_delete` — the middleware
that decides whether to intercept a request (`getActionType`) infers the type from the HTTP method and URL
path and does not currently distinguish `toggle_enable`/`toggle_disable`/`toggle_rule` from `toggle_update`,
nor does it cover `secret_key_create`/`secret_key_delete` (those endpoints are plain `RequireAdmin()`, not
approval-aware). Configuring those unreachable flags has no observable effect through the standard REST
handlers.

> Note: there is no separate `application_update` action type — `getActionType` maps **any** `PUT
> /applications/:id` to `application_create`, same as the create route. So the single
> `application_create` flag in `required_actions` gates both creating and updating applications;
> there's no way to require approval for one but not the other.

```http
GET /approval/enabled
```

```json
{ "message": "approval status checked", "data": { "enabled": true } }
```

```http
GET /approval/required?action_type=toggle_delete
```

```json
{
  "message": "approval requirement checked",
  "data": { "action_type": "toggle_delete", "required": true }
}
```

### 9.2 Requests

An `ApprovalRequest` is created two ways: automatically by `RequireApprovalAware` middleware when an
intercepted mutation is attempted (see §"Roles and access control"), or manually via this endpoint (useful for
actions outside the auto-intercepted set, or for building a custom approval flow client-side).

```http
POST /approval/requests
```

```json
{
  "action_type": "toggle_delete",
  "description": "Remove deprecated checkout flag",
  "team_id": "01TEAM000000000000000001",
  "application_id": "01APP0000000000000000001",
  "toggle_id": "01TGL0000000000000000003",
  "action_data": { "toggleId": "01TGL0000000000000000003" }
}
```

Rules: `action_type` must be one of `toggle_create`, `toggle_update`, `toggle_delete`, `toggle_enable`,
`toggle_disable`, `toggle_rule`, `application_create`, `application_delete`, `secret_key_create`,
`secret_key_delete`; toggle-related action types require `application_id`. `expires_at` is set automatically
(7 days from creation, independent of `default_expiration_days` in settings — see note below). `action_data`
is stored opaquely and only reinterpreted by `POST /approval/requests/:id/execute`.

> Note: `NewApprovalRequest` currently hardcodes a 7-day expiration regardless of the configured
> `default_expiration_days` setting.

Response (`201`):

```json
{
  "message": "approval request created successfully",
  "data": {
    "id": "01APR0000000000000000001",
    "action_type": "toggle_delete",
    "description": "Remove deprecated checkout flag",
    "requested_by": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "team_id": "01TEAM000000000000000001",
    "application_id": "01APP0000000000000000001",
    "toggle_id": "01TGL0000000000000000003",
    "status": "pending",
    "action_data": { "toggleId": "01TGL0000000000000000003" },
    "actioned_by": null,
    "actioned_at": null,
    "rejection_reason": null,
    "expires_at": "2026-08-26T10:00:00Z",
    "created_at": "2026-08-19T10:00:00Z",
    "updated_at": "2026-08-19T10:00:00Z"
  }
}
```

Reads (all wrap `ApprovalRequestWithDetails` — the request plus `requester_name`, `team_name`,
`application_name`, `toggle_path`, `actioned_user_name`):

```http
GET /approval/requests               # all requests
GET /approval/requests/pending       # status = pending only
GET /approval/requests/my            # requested_by = current user
GET /approval/requests/approvable    # pending requests the current user is allowed to approve
GET /approval/requests/:id           # single request
GET /approval/teams/:id/requests     # requests scoped to one team
```

`approvable` excludes the caller's own requests (`CanBeApprovedBy` forbids self-approval) and, for non-root
callers, is further filtered to teams where they are marked as an approver.

```http
POST /approval/requests/:id/approve
```

```json
{}
```

Marks the request `approved` and records `actioned_by`/`actioned_at`. **This does not execute the underlying
action** — approving only changes status; a separate call to `.../execute` performs the write. Fails `403` if
the caller is not `root` and is not a registered approver for the request's team; fails `400` if the request
is not currently `pending` or has already expired.

```http
POST /approval/requests/:id/reject
```

```json
{ "reason": "Toggle still in use by mobile app" }
```

Same authorization rule as approve. `reason` is optional.

```http
POST /approval/requests/:id/execute
```

```json
{}
```

Performs the action described by an **approved** request's `action_data`, dispatching by `action_type` to the
matching use case (create/update/delete the toggle or application, or create/delete a secret key). This is a
separate, explicit step from approval — nothing in the API auto-executes a request the moment it is approved,
so clients driving an approval UI must call this endpoint themselves after approval.

### 9.3 Approvers

Approvers are per-team, tracked on the `team_users` join row (`is_approver`), and only `admin`/`root` team
members can be designated as approvers.

```http
POST /teams/:id/approvers/:user_id
```

```json
{ "is_approver": true }
```

Root-only management action (enforced inside the use case, not via route middleware): requires the approval
system to be enabled, the target user to already be a member of the team, and the target user's role to be
`admin` or `root`. Returns the refreshed approver list for the team.

```json
{
  "data": [
    {
      "team_id": "01TEAM000000000000000001",
      "user_id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      "is_approver": true,
      "username": "alice",
      "role": "admin"
    }
  ]
}
```

```http
GET /teams/:id/approvers
```

Same shape as above, for every member of the team (not just current approvers).

```http
GET /approval/my-approver-teams
```

```json
{
  "message": "user approver teams retrieved successfully",
  "data": ["01TEAM000000000000000001", "01TEAM000000000000000003"]
}
```

### 9.4 Statistics & maintenance

```http
GET /approval/stats
GET /approval/teams/:id/stats
```

```json
{
  "message": "approval stats retrieved successfully",
  "data": { "pending": 3, "approved": 12, "rejected": 1, "expired": 0 }
}
```

```http
POST /approval/mark-expired
```

Root only. Sweeps all still-`pending` requests past their `expires_at` and flips them to `expired`. Not
scheduled automatically by the server — intended to be triggered by an external cron/scheduler.

```json
{ "message": "expired requests marked successfully" }
```
