# REST Flow - API Contract

This document describes the REST API exposed by the ToToggle server (`server/`), a Go/Gin feature-flag
(feature toggle) management platform with hierarchical toggles, team-based access control and an optional
approval workflow.

Use it as a practical contract for agents and clients that need to create, maintain and read applications,
toggles, teams, users and approval requests. The server runs on `http://localhost:3056` by default and also
serves the bundled frontend (`static/`) and a public secret-key API.

> **Every route in this document lives under the `/api` prefix** (`/api/applications`, `/api/teams`, `/api/users`,
> `/api/approval/...`, `/api/auth/...`, the public `/api/toggles`, etc.) — the only exceptions are `/health` and
> `/ready` (k8s probes). This is deliberate: the frontend SPA (`server/web/`) is served from the *same* host/port
> and its client-side routes previously reused bare paths identical to some API routes (`/teams`,
> `/applications/:id`) — a hard refresh on those screens returned the raw API JSON instead of the app shell,
> since the server had no way to tell a browser navigation apart from the SPA's own `fetch()` call to the same
> path. Namespacing the whole API under `/api` removed the ambiguity entirely: anything under `/api` is API,
> anything else is SPA, no per-route heuristics required (see `internal/app/handler/static_handler.go#isAPIRoute`
> and `server/CLAUDE.md`).

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

Most routes require a session token, sent as an HTTP-only cookie (`auth_token`, set automatically by
`POST /api/auth/login`). **Cookie-only** — an `Authorization: Bearer <token>` fallback existed here
historically ("for API compatibility") but was removed: nothing in this monorepo ever used it (the
frontend always sends `credentials: "include"`, never that header), it had no test coverage, and
`POST /api/auth/login`'s JSON response never populated a `token` field anyway, so it was never
actually usable as a real alternative to the cookie.

The token is a 256-bit random value (32 bytes, hex-encoded — `entity.Session`/`entity.NewSession`), issued
server-side on successful login and stored, hashed (SHA-256, never the raw value), in a `sessions` table. It
is only resolvable server-side by hashing the presented token and looking up that hash, so it is not a
general-purpose bearer credential and must be treated as a session secret. **Historical note**: an earlier
version of this API used an unsigned, unverified `token_<userID>` format here — trivially forgeable by anyone
who knew a user's ID. That was a real authentication bypass, fixed by replacing it with the real session
mechanism described above; every session (and the separate, single-use `password_change` token issued by the
forced-first-login flow) is invalidated on logout and on password change.

> **Cross-origin caveat, and why there's no CORS config:** the `auth_token` cookie is set with
> `SameSite=Strict` (`auth_handler.go`), so browsers will never send it on requests originating
> from a different origin than the API — same-origin only (e.g. a frontend served from this
> server's own `static/` bundle, which is how this app is actually deployed). Since session auth
> is cookie-only (above) and the public secret-key API below is never subject to CORS at all (a
> browser-only mechanism; server-to-server callers, which is what every client library is, ignore
> it entirely), there was nothing left for CORS to meaningfully protect — the `CORSHeaders()`
> middleware and `CORS_ALLOWED_ORIGINS` env var were removed. A deployment that genuinely needs a
> separately-hosted frontend against this API would need to reintroduce CORS (and likely relax
> `SameSite`, and have login return the token in the response body) — not a supported
> configuration today.

> **Deployment env vars** (all optional, safe defaults): `SERVER_PORT` (default `3056`), `DB_PATH`
> (default `./db/toggles.db`), `COOKIE_SECURE` (default `true` — only set to `false` for local
> HTTP-only development; the `auth_token`/`password_change_token` cookies won't be sent by the
> browser over plain HTTP when this is `true`), `TLS_CERT_FILE`/`TLS_KEY_FILE` (both optional, but must be set
> together — the server terminates HTTPS itself when both are present, stays on plain HTTP
> otherwise, and refuses to boot if only one is set). Logs are structured JSON on stdout.

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

- `ValidateToken()`: requires a valid session; also blocks access (except to `/api/auth/change-password` and
  `/change-password`) and returns `428 Precondition Required` if the user's `must_change_password` flag is
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
    `POST /api/approval/requests/{id}/execute` after the request is approved.

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
- `409 Conflict`: **only** used by `POST /api/applications` for a duplicate application name
  (`application_handler.go`, when `CreateApplication` returns `ErrCodeAlreadyExists`). Every other
  "already exists" condition elsewhere in the API (toggles, teams, users, team memberships,
  team/application associations) is reported as `400` with `ErrCodeAlreadyExists` instead — this
  is the one exception, so don't treat 400-vs-409 as a reliable global signal.
- `428 Precondition Required`: password change required before the request can proceed. (Not `412` —
  that code is "Precondition Failed"; the handler uses Go's `http.StatusPreconditionRequired`, which is 428
  per RFC 6585, confirmed live against the running server.)
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
internal error, `T0006` invalid path, `T0007` invalid toggle. `T0008` (toggle has children, delete refused)
was removed in v2.6 — deleting a toggle with children is no longer an error, see §7.

## Quick endpoint index

```http
# Health (no auth)
GET  /health
GET  /ready

# Auth (no auth, except change-password)
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/forgot-password               # always returns success, never reveals if the username exists
GET  /api/auth/check-first-access
POST /api/auth/change-password              # requires session
POST /api/auth/change-password-first-time   # uses temporary password_change_token cookie or body user_id/username

# Public toggle API (secret key, header X-API-Key)
GET /api/toggles

# Applications (session required)
POST   /api/applications                          # approval-aware, min role admin
GET    /api/applications                          # filtered by team membership unless root
GET    /api/applications/:id
PUT    /api/applications/:id                      # approval-aware, min role admin
DELETE /api/applications/:id                      # approval-aware, min role root
POST   /api/applications/:id/generate-secret      # approval-aware, min role admin
GET    /api/applications/:id/secret-keys          # admin/root only

# Toggles (session required)
POST   /api/applications/:id/toggles                       # approval-aware, min role admin
GET    /api/applications/:id/toggles                       # ?hierarchy=true for tree view
GET    /api/applications/:id/toggles/archived               # archive roots (deleted toggles), min role admin
GET    /api/applications/:id/toggles/:toggleId
PUT    /api/applications/:id/toggles/:toggleId              # approval-aware, min role admin
DELETE /api/applications/:id/toggles/:toggleId              # approval-aware, min role admin — recursive, soft-delete
POST   /api/applications/:id/toggles/:toggleId/restore       # undo a delete, min role admin, not approval-aware
PUT    /api/applications/:id/toggle/:toggleId                # recursive enable/disable, approval-aware, min role admin
PUT    /api/applications/:id/toggles/bulk                    # multi-select, own bit only (not recursive), approval-aware, min role admin

# Secret keys management (session required)
DELETE /api/secret-keys/:id                       # approval-aware, min role admin

# User management (session required; create/list: root or admin, scoped to admin's own teams —
# get/update/delete/reset-password/status: root only)
POST   /api/users
GET    /api/users
GET    /api/users/:id
PUT    /api/users/:id
DELETE /api/users/:id
POST   /api/users/:id/reset-password
PUT    /api/users/:id/status

# Current user profile (session required, any role)
GET  /api/profile
POST /api/profile/change-password
GET  /api/profile/teams

# Team management (session required, root only)
POST   /api/teams
GET    /api/teams
GET    /api/teams/:id
PUT    /api/teams/:id
DELETE /api/teams/:id
POST   /api/teams/:id/users
DELETE /api/teams/:id/users/:user_id
GET    /api/teams/:id/users
POST   /api/teams/:id/applications
DELETE /api/teams/:id/applications/:app_id
PUT    /api/teams/:id/applications/:app_id
GET    /api/teams/:id/applications
POST   /api/teams/:id/approvers/:user_id
GET    /api/teams/:id/approvers

# Approval workflow (session required)
GET  /api/approval/settings                     # root only
PUT  /api/approval/settings                     # root only
GET  /api/approval/enabled
GET  /api/approval/required?action_type=...
POST /api/approval/requests
GET  /api/approval/requests
GET  /api/approval/requests/pending
GET  /api/approval/requests/my
GET  /api/approval/requests/approvable
GET  /api/approval/requests/:id
POST /api/approval/requests/:id/approve
POST /api/approval/requests/:id/reject
POST /api/approval/requests/:id/execute
POST /api/approval/requests/:id/withdraw        # requester only, pending only
GET  /api/approval/teams-without-approver       # caller's own teams that have zero approvers
GET  /api/approval/teams/:id/requests
GET  /api/approval/stats
GET  /api/approval/teams/:id/stats
POST /api/approval/mark-expired                 # root only
GET  /api/approval/my-approver-teams

# Audit trail (session required)
GET  /api/audit?category=...&cursor=...&limit=...
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
POST /api/auth/login
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
POST /api/auth/logout
```

Clears the `auth_token` cookie. Returns `{"success": true, "message": "Logged out successfully"}`.

```http
POST /api/auth/forgot-password
```

Unauthenticated (this is what the login screen's "Forgot password?" link calls), rate-limited per IP
(10/15min, a separate budget from the login rate limit). There is no email in this system — the whole flow is
"tell an admin to reset it for you" (v2.6 §5.5):

```json
{ "username": "alice" }
```

**Always** responds `{"success": true}`, regardless of whether `username` exists — this endpoint would
otherwise be a username-enumeration oracle. When the username *does* exist, it writes a
`password_reset_requested` audit event (`text`: `` `Password reset requested for <b>@{username}</b>` ``,
`target`: `"Self-service (login screen)"`) with a synthetic system actor (there is no session yet to attribute
it to) and a `null` `team_id` — root-only visibility in `GET /api/audit`, same rule as
`approval_system_toggled`. A root/admin sees it in History and resolves it the ordinary way:
`POST /api/users/:id/reset-password` (§3).

```http
GET /api/auth/check-first-access
```

Returns `{"first_access": true, "user_count": 0}` when no users exist yet — used by the frontend to decide
whether to show a bootstrap flow. In practice a `root` user with a random password is always created on server
startup (see `InitializeRootUser`), so `first_access` is really "have you completed the forced root password
change".

```http
POST /api/auth/change-password-first-time
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
POST /api/auth/change-password
```

Requires a valid session (`ValidateToken()`); routed to the same profile handler as
`POST /api/profile/change-password` (see §5).

## 3. User Management

Create/list: `root` **or** `admin` (`admin` is restricted to teams they already belong to — see below).
Get/update/delete/reset-password/status: `root` only.

```http
POST /api/users
```

```json
{ "name": "Alice Ribeiro", "username": "alice", "role": "admin", "team_id": "01TEAM000000000000000001", "is_approver": false }
```

Rules:

- `name` (full display name) is **required**, distinct from `username` (login) — confirmed in the real
  prototype (`get_full_jsx("UserModal")`): it's the first field on the form, and its own validation runs
  before even the username check. Stored on `entity.User.Name`. Used as the primary label wherever a user
  is shown (`UserRow`: `{name}` bold, `@{username}` secondary) and, critically, as the `actor_name`/`initials`
  basis for every audit-log entry that user causes as actor (`AuditUseCase.Record` uses `actor.Name`, not
  `actor.Username` — matches the prototype's `logAudit(...)`, which always uses `currentUser.name`). Before
  this field existed, `UserRow` could only show `@username` and the audit trail's avatar initials were derived
  from the username, not a real name — closed gap, not a new feature.
- `role` must be `"admin"` or `"user"` — `"root"` is rejected (`400`, "Cannot create additional root users").
- `team_id` is **required** — the new user is associated with that team as part of the same request (not a
  separate step). The team must exist (`400` otherwise). When the caller is `admin` (not `root`), `team_id`
  must be one of the teams the caller already belongs to, or the request is rejected (`403`,
  "Admins can only create users in teams they belong to").
- `is_approver` is optional and only takes effect when the caller is `root` **and** `role` is `"admin"` — any
  other combination (an `admin` caller, or `role: "user"`) silently ignores it, enforced server-side
  regardless of what the client sends.
- No password is supplied by the caller: the server generates a random one and forces `must_change_password =
  true`. The response is the only place the plaintext password is returned, so it must be captured immediately.
- Team association (and the approver flag, when applicable) is applied **after** the user is created and is
  best-effort: a failure there does not roll back the user, it's surfaced as a non-fatal `warning` string in
  the response instead (mirrors `team_warnings` on `PUT /api/users/:id` below).

Response (`201`):

```json
{
  "success": true,
  "user": {
    "id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "name": "Alice Ribeiro",
    "username": "alice",
    "role": "admin",
    "must_change_password": true,
    "active": true,
    "status": "pending_first_login",
    "created_at": "2026-08-19T10:00:00Z",
    "updated_at": "2026-08-19T10:00:00Z"
  },
  "password": "Xk9$mQ2pLw#T",
  "warning": null
}
```

`status` is derived, never stored directly: `"disabled"` when `active` is `false` (takes priority),
`"pending_first_login"` when `active` is `true` but `must_change_password` is still `true`, `"active"`
otherwise.

Read/delete:

```http
GET    /api/users
GET    /api/users/:id
DELETE /api/users/:id
```

`GET /api/users` (list) is scoped when the caller is `admin`: only accounts that share at least one team
with the caller are returned, plus the caller's own account. `root` always sees everyone.

`DELETE` refuses to remove a `root` user (`403`), and refuses to let a `root` user delete their own account
(`403`).

```http
POST /api/users/:id/reset-password
```

Root only. Generates a fresh random password, sets `must_change_password = true`, and returns the plaintext
password once — same reveal-once contract as creation. Refuses to reset the `root` user's own password this
way (`403`; root changes its own password via `POST /api/profile/change-password`, §4).

```json
{ "success": true, "user": { "...": "...", "status": "pending_first_login" }, "password": "Nq7!vRxK2pLm" }
```

There is deliberately **no** endpoint to re-read a password already shown once — only the bcrypt hash is
ever stored, so an already-displayed password cannot be recovered. Resetting (which invalidates the old one)
is the only way to hand out a new one.

```http
PUT /api/users/:id/status
```

Root only. Body: `{ "active": false }`. Disables or re-enables a user without deleting the account — a
disabled user is blocked at login but keeps their history/associations intact. Refuses to change the `root`
user's status either way (`403`) — this also covers "root can't disable itself", since root can never be the
target of this endpoint at all.

```http
PUT /api/users/:id
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
GET /api/profile
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
POST /api/profile/change-password
```

```json
{ "current_password": "old", "new_password": "newSecret123" }
```

Verifies `current_password` against the stored hash, sets the new password, and clears
`must_change_password`. `400` if the new password is under 4 characters; `401` if `current_password` is wrong.

```http
GET /api/profile/teams
```

Returns the caller's own team memberships: `{"success": true, "teams": [...]}` (`entity.Team[]`).

## 5. Team Management (Root Only)

```http
POST /api/teams
```

```json
{ "name": "Payments Squad", "description": "Owns payments features" }
```

Rules: `name` 2–100 chars and globally unique; `description` up to 500 chars.

```http
GET    /api/teams
GET    /api/teams/:id
PUT    /api/teams/:id
DELETE /api/teams/:id
```

`GET /api/teams` returns `TeamWithCounts[]` (adds `user_count` / `application_count`); `GET /api/teams/:id` returns the
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
POST   /api/teams/:id/users
```

```json
{ "user_id": "01ARZ3NDEKTSV4RRFFQ69G5FAV" }
```

Rejects with `400` if the user is already a member.

```http
DELETE /api/teams/:id/users/:user_id
GET    /api/teams/:id/users
```

### Team ↔ application permissions

```http
POST /api/teams/:id/applications
```

```json
{ "application_id": "01APP0000000000000000001", "permission": "write" }
```

`permission` is one of `read`, `write`, `admin`. Rejects with `400` if the application is already associated
with this team (an application can belong to more than one team, each with its own permission level).

```http
DELETE /api/teams/:id/applications/:app_id
```

```http
PUT /api/teams/:id/applications/:app_id
```

```json
{ "permission": "admin" }
```

Requires the association to already exist (`400` otherwise).

```http
GET /api/teams/:id/applications
```

### Team approvers

See §9.3 — approver assignment lives under `/api/teams/:id/approvers/:user_id` but is implemented by the approval
handler/use case, not the team use case.

## 6. Applications

```http
POST /api/applications
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
GET /api/applications
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
    "toggles_disabled": 3,
    "has_secret_key": true
  }
]
```

`has_secret_key` is `true` when the application has at least one secret key row (`secret_keys.application_id`), regardless of how many — the API only ever exposes presence, never a count or the key material itself (§7 below).

```http
GET /api/applications/:id
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
PUT /api/applications/:id
```

Approval-aware, minimum role `admin`.

```json
{ "name": "Checkout Web v2", "team_id": "01TEAM000000000000000002" }
```

`team_id` is optional. When present, the application is **moved**: it is removed from every team it currently
belongs to and re-associated with the new team at `admin` permission (this is a full replace, not an add).

```http
DELETE /api/applications/:id
```

Approval-aware, minimum role `root` (the strictest mutation in the API). Cascades: deletes every toggle under
the application before deleting the application itself. Response: `{"message": "application deleted
successfully"}`.

## 7. Toggles

Toggles are addressed two ways: by dot-separated `path` (used only for creation) and by `id` (used for every
other operation, always scoped to the `:id` application in the URL — a toggle ID that belongs to a different
application resolves as a validation error, not `404`).

```http
POST /api/applications/:id/toggles
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
GET /api/applications/:id/toggles
GET /api/applications/:id/toggles?hierarchy=true
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
GET /api/applications/:id/toggles/:toggleId
```

Returns the raw `Toggle` entity (own `enabled` value — not hierarchy-resolved; combine with parent traversal
or use the hierarchy endpoint if the effective state is needed).

```http
PUT /api/applications/:id/toggles/:toggleId
```

Approval-aware, minimum role `admin`. Full replace of the toggle's own `enabled` flag and activation rule —
**not** recursive (children are untouched; compare with §7's `PUT /api/applications/:id/toggle/:toggleId` below).

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

Unlike this endpoint's UI (`EditToggleDrawer`), the recursive one below leaves its own status
switch enabled even when an ancestor is off — enabling a toggle here is allowed but has no
practical effect until the blocking ancestor is also turned on. When that happens, the
`toggle_enabled` audit event's text gets an extra suffix naming the specific blocking segment:
`Enabled <b>{value}</b> <i>(no effect — {ancestor} is off)</i>` (v2.6 §3.3). The suffix only
appears on this non-recursive endpoint — the recursive one below has no equivalent client-side
path that could enable a toggle whose ancestor is off, so it never needs the check.

```http
DELETE /api/applications/:id/toggles/:toggleId
```

Approval-aware, minimum role `admin`. **Recursive and reversible (v2.6 §3.4/4.1)**: deletes the
targeted toggle and its entire descendant subtree in one call — a node with children is no longer
refused (the old `T0008`/"toggle has children" error code was removed). Deletion is a soft-delete
(the rows stay in the database, just excluded from every normal read), and only the exact toggle
the caller targeted is marked as the *archive root* (see `GET .../toggles/archived` below) — the
cascaded descendants are hidden along with it but aren't separate archive entries. Ancestors are
never touched: this endpoint does not bubble up to remove a parent left with no other children
(that cleanup existed only because deletion used to be leaf-only; now that any node can be deleted
directly, an emptied ancestor is just another node the caller can delete explicitly if they want).

```http
POST /api/applications/:id/toggles/:toggleId/restore
```

Minimum role `admin`, **not** approval-aware (undoing a decided, already-audited action isn't a
new mutation to review). Restores a previously deleted toggle and its whole subtree. `404` if the
toggle was never deleted or isn't the archive root of its deletion (a cascaded descendant has no
independent restore point — restore the root instead). `409` (`T0003`, already-exists) if a live
toggle now occupies the same path (or the path of any descendant in the archived subtree) —
restore is refused rather than creating a path collision.

```http
GET /api/applications/:id/toggles/archived
```

Minimum role `admin`. Lists archive roots (one entry per delete operation, most recent first) for
an application:

```json
{
  "message": "archived toggles retrieved successfully",
  "toggles": [
    { "id": "01TGL...", "path": "payments.card", "deleted_at": "2026-09-03T12:00:00Z", "deleted_by_name": "alice" }
  ]
}
```

```http
PUT /api/applications/:id/toggle/:toggleId
```

Note the **singular** `toggle` in the path — this is a distinct, more powerful endpoint. Approval-aware,
minimum role `admin`.

```json
{ "enabled": false }
```

Recursively sets `enabled` on the target toggle **and every descendant**, in a single call — the intended way
to disable/enable an entire subtree at once (e.g. kill-switching `user.payments.*`). Response is the refreshed
target `Toggle`.

```http
PUT /api/applications/:id/toggles/bulk
```

v2.6 §6.5 — multi-select in the toggle grid. Approval-aware, minimum role `admin`.

```json
{ "toggle_ids": ["01TGL...", "01TGL..."], "enabled": true }
```

Flips the **own** bit of every listed toggle in one call — never recursive (a listed toggle's own children,
if any, are untouched; compare with the singular endpoint above). Every ID must belong to `:id`'s application
or the whole call fails with no partial effect claimed (there's no transaction, so a failure partway through
does **not** roll back toggles already flipped before it — same consistency level as the rest of this API).
Reuses the `toggle_enable`/`toggle_disable` approval action types (same approval-config switch as the singular
recursive endpoint above) rather than introducing a third — `getActionType` distinguishes this route by its
literal `/bulk` suffix before falling through to the generic per-toggle case. A pending request created here
has no single `toggle_id` (the targets live in `action_data.toggle_ids` instead) and a description like
`"Enable 3 toggles"`.

```json
{ "message": "toggles updated successfully", "toggle_ids": ["01TGL...", "01TGL..."], "enabled": true }
```

## 8. Public API (Secret Keys)

Secret keys let a service fetch an application's toggles without a user session — meant for SDK/client
integrations (see the top-level project README for the companion Java/Kotlin client).

```http
POST /api/applications/:id/generate-secret
```

Approval-aware, minimum role admin (root always bypasses). "Generate" is really "regenerate": exactly one new
key named `"API Access Key"` is created and becomes the application's **current** key.

**Rotation has a manual overlap window (v2.6 §5.1)**: the previously-current key is **not** deleted — it
becomes the **previous** key and keeps authenticating (`GET /api/toggles`, the kill switch) until someone
explicitly revokes it (`DELETE /api/secret-keys/:id`, passing its own ID) or it gets pushed out by a *second*
rotation. There is room for exactly one previous key per application at a time (current + previous, never a
longer history) — regenerating again while a previous key already exists revokes that older previous key
outright before demoting the current one. This exists so a consumer mid-deploy with the old key configured
doesn't get a hard outage the moment someone rotates; it does mean two keys can authenticate for the same
application simultaneously by design during that window.

```json
{
  "success": true,
  "secret_key": {
    "id": "01SK00000000000000000001",
    "name": "API Access Key",
    "application_id": "01APP0000000000000000001",
    "created_by": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "active": true,
    "is_current": true,
    "last_used_at": null,
    "created_at": "2026-08-19T10:00:00Z",
    "updated_at": "2026-08-19T10:00:00Z"
  },
  "plain_key": "sk_9f1c...redacted...",
  "warning": "This key will only be shown once. Please store it securely."
}
```

`plain_key` is never persisted or retrievable again — only its SHA-256 hash is stored (`key_hash`, which is
never serialized in any response). `last_used_at` (v2.6 §5.6) is a real, live-tracked timestamp — updated on
every successful `ValidateSecretKey` call (both `GET /api/toggles` and the kill switch), best-effort (a
failure to persist it never fails the authenticated request itself). `null` means the key has never
authenticated anything yet.

**When approval is required for `secret_key_create`**, the `202` response below carries `plain_key` too — the
key's row is created (hashed) immediately, at request time, not at execute time. This closes a real bug: the
original design generated the key only inside `.../execute`, discarded the plaintext, and left a secret key
that literally no one could ever retrieve. Now:

```json
{
  "message": "action requires approval",
  "approval_required": true,
  "action_type": "secret_key_create",
  "plain_key": "sk_9f1c...redacted...",
  "warning": "This key will only be shown once. Please store it securely. It will not work until the request is approved."
}
```

The row exists but is **inactive** (`secret_keys.active = false`) — `ValidateSecretKey` (the `X-API-Key`
auth path used by `GET /api/toggles` and the kill switch) rejects it exactly like a nonexistent key, and it
does not show up in `GET /api/applications/:id/secret-keys` either. The requester can copy the value and
configure their service immediately; it just won't authenticate anything yet. Any previously-active key for
the application keeps working unchanged throughout the wait — nothing is rotated until approval. On
`.../execute`, the pending row is activated and becomes current; the same overlap rule as the immediate path
applies to whatever was current before (demoted to previous, not deleted). On `.../reject`, the pending row
is deleted physically — it never became valid, so there is no reason to keep the hash. See
`ApprovalUseCase.CreateApprovalRequest`/`RejectRequest`/`executeSecretKeyCreateAction` and
`SecretKeyUseCase.CreatePendingSecretKey`/`ActivateAndRotateSecretKey`/`rotateExistingKeys`.

```http
GET /api/applications/:id/secret-keys
```

Admin/root only. Lists key metadata (no plaintext, no hash) for the application — up to 2 entries during an
overlap window (current + previous), distinguished by `is_current`. Revoked keys and still-pending
(`active: false`) keys never appear here.

```http
DELETE /api/secret-keys/:id
```

Approval-aware, minimum role admin (root always bypasses). **Revokes**, not deletes — the row stays in the
database (audit history), `revoked_at` gets set, and it immediately stops authenticating and stops showing up
in `GET /api/applications/:id/secret-keys`. Works on either the current or the previous key; the caller picks
which by which `id` it passes (both come from the list endpoint above) — there's no separate route for
"revoke the previous key specifically."

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

### 8.1 Kill switch — disable a toggle by path

```http
POST /api/toggles/disable
X-API-Key: sk_9f1c...
Content-Type: application/json

{"path": "user.payments.view-table"}
```

Minimal-scope endpoint for external monitoring/alerting systems to disable a single feature
immediately — **only disables, never enables, never touches activation rules, never reads
anything beyond what's needed to validate the key.** Re-enabling a toggle still requires the
regular admin-session-authenticated endpoints (`PUT /api/applications/:id/toggles/:toggleId` or
the recursive `.../toggle/:toggleId`) — deliberately asymmetric, so a leaked key can only ever
turn things off.

- Uses the **same** secret key as `GET /api/toggles` above — no separate credential. A real
  trade-off worth knowing: a leaked key that could only read toggles before can now also disable
  any of them (within its own application only — see scoping below). Accepted here because this
  key is already a high-value, per-application credential and the deployment isn't
  internet-facing; a setup with a different threat model might prefer a second, disable-only key
  type instead.
- Scoped to the calling key's own application: the toggle is looked up by `path` **within that
  application only** (`ToggleUseCase.UpdateToggle`, `internal/app/usecase/toggle_usecase.go`) — a
  key can never disable a same-named path belonging to a different application, even if it knows
  the exact string.
- **Deliberately bypasses the approval workflow** (§9 below) — registered outside the
  session/approval middleware chain entirely (same route group as the public `GET /api/toggles`).
  A kill switch that has to wait for human approval isn't a kill switch. (Note: as of this
  writing, `toggle_disable` isn't actually produced as a distinct approval action type by any
  session-authenticated route either — see the note under §9.1 on `getActionType` — so this isn't
  bypassing a protection that otherwise existed for disabling via the admin UI.)
- Idempotent: disabling an already-disabled toggle returns `200`, not an error.
- Rate-limited per secret key (30 requests / 5 minutes) — `429` past that, independent of any
  other key's usage.

Responses: `200 {"path": "...", "enabled": false}` on success; `401` missing `X-API-Key` header;
`404` unknown/invalid key, or the path doesn't resolve within that key's application; `429` rate
limit exceeded.

## 9. Approval Workflow

An optional governance layer, off by default, that can force selected mutation types (per action type) to go
through a two-step propose → approve → execute flow instead of applying immediately. Root users are always
exempt and can act directly regardless of settings.

### 9.1 Settings (Root Only)

```http
GET /api/approval/settings
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
PUT /api/approval/settings
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

All ten action types are now intercepted end-to-end by the middleware. `toggle_enable`/
`toggle_disable` are distinguished from a plain `toggle_update` by the `enabled` value sent to the
recursive endpoint (`PUT /api/applications/:id/toggle/:toggleId`) — the same two action types also
cover the bulk endpoint (`PUT /api/applications/:id/toggles/bulk`, §7); a pending request from
either route is told apart at execution time by whether it carries a single `toggle_id` (recursive)
or none (bulk, targets live in `action_data.toggle_ids`). `toggle_rule` is distinguished
from `toggle_update` on the non-recursive endpoint (`PUT /api/applications/:id/toggles/:toggleId`)
by the presence of `has_activation_rule: true` or a non-null `activation_rule` in the request body
— a request that only flips `enabled` on that endpoint, without touching the rule, still counts as
`toggle_update`. `secret_key_create`/`secret_key_delete` are enforced on
`POST /api/applications/:id/generate-secret` and `DELETE /api/secret-keys/:id`, which are now
approval-aware routes rather than plain `RequireAdmin()`.

One known limitation: the `toggle_rule` heuristic can't detect *clearing* a previously-set rule
(sending `has_activation_rule: false` when a rule already exists) as a rule change, since that
would require reading the toggle's current state — the middleware only looks at the request body.
That request is classified as `toggle_update` instead.

> Note: there is no separate `application_update` action type — `getActionType` maps **any** `PUT
> /api/applications/:id` to `application_create`, same as the create route. So the single
> `application_create` flag in `required_actions` gates both creating and updating applications;
> there's no way to require approval for one but not the other. Execution correctly tells the two
> apart internally, though: the middleware captures the target application's ID when the request
> is a `PUT` (never possible for a real `POST` create, which has no ID yet), and
> `ExecuteApprovedAction` branches on that to update the existing application instead of
> attempting to create a new one. Before this was fixed, approving an edit always failed at
> execute time (it tried to create a new application and had no `team_id` to do it with).

```http
GET /api/approval/enabled
```

```json
{ "message": "approval status checked", "data": { "enabled": true } }
```

```http
GET /api/approval/required?action_type=toggle_delete
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
POST /api/approval/requests
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
is stored opaquely and only reinterpreted by `POST /api/approval/requests/:id/execute`.

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
`application_name`, `toggle_path`, `actioned_user_name`). **All of them are scoped by team
membership** (`domain/policy.ApprovalAccess`, shared by every approval endpoint below): root sees
everything unfiltered; anyone else only ever sees requests belonging to a team they are a member
of (`team_users`, any role — not just approvers). This is enforced server-side, not just hidden in
the UI:

```http
GET /api/approval/requests               # any status; root: every team, others: own teams only
GET /api/approval/requests/pending       # status = pending only — root only (403 otherwise)
GET /api/approval/requests/my            # requested_by = current user
GET /api/approval/requests/approvable    # pending requests the current user is allowed to approve
GET /api/approval/requests/:id           # single request — 404 (not 403) if the caller isn't root
                                          # or a member of the owning team, to avoid confirming
                                          # the id exists to an outsider
GET /api/approval/teams/:id/requests     # any status, scoped to one team — 403 if the caller
                                          # isn't root or a member of that team
```

`approvable` excludes the caller's own requests (`CanBeApprovedBy` forbids self-approval) and, for non-root
callers, is further filtered to teams where they are marked as an approver — a strictly narrower scope than
plain membership, since acting on a request requires being a designated approver, not just a team member.

`POST /api/approval/requests` also enforces this: the requester must belong to `team_id` (root exempt),
`403` otherwise.

```http
POST /api/approval/requests/:id/approve
```

```json
{}
```

Marks the request `approved` and records `actioned_by`/`actioned_at`. **This does not execute the underlying
action** — approving only changes status; a separate call to `.../execute` performs the write. Fails `403` if
the caller is not `root` and is not a registered approver for the request's team; fails `400` if the request
is not currently `pending` or has already expired.

```http
POST /api/approval/requests/:id/reject
```

```json
{ "reason": "Toggle still in use by mobile app" }
```

Same authorization rule as approve. `reason` is optional.

```http
POST /api/approval/requests/:id/execute
```

```json
{}
```

Performs the action described by an **approved** request's `action_data`, dispatching by `action_type` to the
matching use case (create/update/delete the toggle or application, or create/delete a secret key). This is a
separate, explicit step from approval — nothing in the API auto-executes a request the moment it is approved,
so clients driving an approval UI must call this endpoint themselves after approval.

Same authorization rule as approve/reject (`403` if the caller is not `root` and not a registered approver
for the request's team) — this endpoint used to have **no caller check at all**, letting any authenticated
session execute any already-approved request regardless of team.

```http
POST /api/approval/requests/:id/withdraw
```

```json
{}
```

Cancels a **pending** request the caller themself opened. Deliberately a different authorization rule from
approve/reject/execute: those require being `root` or a registered approver for the team; this requires being
the exact requester (`requested_by == caller.id`) — not even `root` or the team's own approver can withdraw
someone else's request, matching the confirmed v2.6 prototype's "Withdraw" button, which only ever appears on
the requester's own "Mine" tab. `403` if the caller isn't the requester, `400` if the request is no longer
`pending`. The row is deleted outright (not a new `ApprovalStatus`), and — same as reject — if this was a
`secret_key_create` request, the pending-inactive `SecretKey` row created inline at request time is deleted
too, since it never became valid.

### 9.3 Approvers

Approvers are per-team, tracked on the `team_users` join row (`is_approver`), and only `admin`/`root` team
members can be designated as approvers.

```http
POST /api/teams/:id/approvers/:user_id
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
GET /api/teams/:id/approvers
```

Same shape as above, for every member of the team (not just current approvers).

```http
GET /api/approval/my-approver-teams
```

```json
{
  "message": "user approver teams retrieved successfully",
  "data": ["01TEAM000000000000000001", "01TEAM000000000000000003"]
}
```

```http
GET /api/approval/teams-without-approver
```

```json
{
  "message": "teams without an approver retrieved successfully",
  "data": [{ "id": "01TEAM000000000000000002", "name": "Growth", "...": "..." }]
}
```

Any authenticated role (not `RequireRoot()` — deliberately different from `GET /teams/:id/approvers`, which
sits under the root-only `/teams` group and would leak the full member/approver roster). Scoped to the
caller's own teams only, and only reveals the yes/no "does this team have any approver" fact per team, never
who the members or approvers are — backs the "You are not an approver on any of your teams..." banner on the
Approvals screen (v2.6 §2.10).

### 9.4 Statistics & maintenance

```http
GET /api/approval/stats               # root: every team; others: own teams only
GET /api/approval/teams/:id/stats     # one team — 403 if the caller isn't root or a member
```

```json
{
  "message": "approval stats retrieved successfully",
  "data": { "pending": 3, "approved": 12, "rejected": 1, "expired": 0 }
}
```

```http
POST /api/approval/mark-expired
```

Root only. Sweeps all still-`pending` requests past their `expires_at` and flips them to `expired`. Not
scheduled automatically by the server — intended to be triggered by an external cron/scheduler.

```json
{ "message": "expired requests marked successfully" }
```

## 10. Audit Trail

```http
GET /api/audit?category=toggles&cursor=<opaque>&limit=30
```

Any authenticated role. Root sees every event; anyone else only sees events scoped to a team they're a
member of (`domain/policy.AuditAccess` — same team-membership rule as `GET /api/approval/requests`, not
the narrower "is an approver" rule). A handful of events (only the approval-system on/off toggle today)
carry no team at all and are therefore only ever visible to root.

- `category` — one of `toggles`, `keys`, `access`, `approvals`; omit for all categories. Matches the 4
  filter chips of the real prototype's `HistoryView`.
- `cursor` — opaque string from a previous response's `next_cursor`; omit for the first page. This is
  **infinite-scroll pagination, not page numbers** — there is no "page 3", only "the next slice before
  what I already have."
- `limit` — page size, default 30, capped at 100.

```json
{
  "data": [
    {
      "id": "01AUDIT0000000000000000001",
      "event_type": "toggle_deleted",
      "category": "toggles",
      "text": "Deleted toggle payments.card",
      "target": "",
      "team_id": "01TEAM000000000000000001",
      "actor_id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      "actor_name": "alice",
      "created_at": "2026-08-30T10:00:00Z"
    }
  ],
  "next_cursor": "MjAyNi0wOC0zMFQxMDowMDowMFp8MDFBVURJVDAwMDAwMDAwMDAwMDAwMDAwMDE"
}
```

`next_cursor` is `""` when there is no further page. `text` may embed the literal markers `<b>...</b>`
around the key term of the sentence (e.g. `"Disabled <b>experiments</b> branch"`) and, only on
`toggle_enabled` when the enable had no practical effect (v2.6 §3.3), `<i>...</i>` around a trailing
`(no effect — {ancestor} is off)` note — both match the real prototype's own audit text (`app.jsx#logAudit`,
`AUDIT_SEED`). `target` never does. **This is not raw HTML** — the client never renders `text` via
`dangerouslySetInnerHTML` (the prototype does; this API deliberately doesn't behave like that). Since
`text` can embed a user-controlled value (a toggle path, an application/team/user name), rendering it as
real HTML would be a stored-XSS vector — instead, the client
(`server/web/src/lib/auditEvents.tsx#renderAuditText`) recognizes only the exact `<b>...</b>` and
`<i>...</i>` markers and builds real React `<b>`/`<i>` elements from them; every other character —
including `<`, `>`, `&` from a malicious name — renders as inert plain text. Worst case a malicious
value contains a literal `<b>...</b>`/`<i>...</i>` itself: that portion renders bold/italic, which is
cosmetic, not a vulnerability.

**Coverage — what actually writes an entry**: every *immediate* mutation (the approval workflow
disabled, or that action type not configured to require it) writes an entry at the point of execution:
toggle create/delete/enable/disable/rule, service key generate/revoke, application create/delete/
update, team create, member add/remove, user create/delete/status-change/password-reset. The approval
workflow writes three additional entries per request that goes through it, each with the actor who was
actually responsible for that step (not always the same person): `approval_requested` (the requester,
at creation time), `approval_approved`/`approval_rejected` (the approver), and the domain-specific
event itself (`toggle_created`, `key_generated`, etc., text suffixed `" (after approval)"`) once
`POST /api/approval/requests/:id/execute` actually applies it — attributed to whoever called `.../execute`
(typically the approver), never the original requester, matching the prototype's own choice.
Only gap left: `POST /api/toggles/disable` (the kill switch) authenticates by secret key, not a
session, so there's no `entity.User` to be the actor — deliberately uncovered rather than inventing a
synthetic "the secret key" actor.
