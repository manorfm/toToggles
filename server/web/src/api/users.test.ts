import { afterEach, describe, expect, it, vi } from "vitest";
import { createUser, deleteUser, listUsers, resetUserPassword, setUserStatus } from "./users";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("listUsers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("unwraps GET /users's {success,users} envelope (root or admin)", async () => {
    const users = [{ id: "1", username: "alice", role: "admin", must_change_password: false, active: true, status: "active", created_at: "", updated_at: "" }];
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, users }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listUsers();

    expect(fetchMock).toHaveBeenCalledWith("/api/users", expect.anything());
    expect(result).toEqual(users);
  });

  it("returns an empty array when 'users' is omitted", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true })));

    await expect(listUsers()).resolves.toEqual([]);
  });

  it("propagates ApiError for callers with no access", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(403, { error: "Forbidden" })));

    await expect(listUsers()).rejects.toMatchObject({ status: 403 });
  });
});

describe("createUser", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts name/username/role/team_id and returns the created user with its one-time password", async () => {
    const user = { id: "2", name: "Bob Test", username: "bob", role: "admin", must_change_password: true, active: true, status: "pending_first_login", created_at: "", updated_at: "" };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { success: true, user, password: "Xk9$mQ2pLw#T" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createUser({ name: "Bob Test", username: "bob", role: "admin", teamId: "t1" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/users",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Bob Test", username: "bob", role: "admin", team_id: "t1", is_approver: false }),
      })
    );
    expect(result).toEqual({ user, password: "Xk9$mQ2pLw#T", warning: undefined });
  });

  it("sends is_approver true when requested (only meaningful for root creating an admin, enforced server-side)", async () => {
    const user = { id: "3", name: "Carol Test", username: "carol", role: "admin", must_change_password: true, active: true, status: "pending_first_login", created_at: "", updated_at: "" };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { success: true, user, password: "abc" }));
    vi.stubGlobal("fetch", fetchMock);

    await createUser({ name: "Carol Test", username: "carol", role: "admin", teamId: "t1", isApprover: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/users",
      expect.objectContaining({
        body: JSON.stringify({ name: "Carol Test", username: "carol", role: "admin", team_id: "t1", is_approver: true }),
      })
    );
  });

  it("surfaces a warning when the user was created but team association failed", async () => {
    const user = { id: "2", name: "Bob Test", username: "bob", role: "user", must_change_password: true, active: true, status: "pending_first_login", created_at: "", updated_at: "" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(201, { success: true, user, password: "x", warning: "User created, but failed to add to the team" }))
    );

    const result = await createUser({ name: "Bob Test", username: "bob", role: "user", teamId: "t1" });

    expect(result.warning).toBe("User created, but failed to add to the team");
  });

  it("propagates ApiError on a duplicate username", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(409, { code: "T0003", message: "username already exists" })));

    await expect(createUser({ name: "Bob Test", username: "bob", role: "user", teamId: "t1" })).rejects.toMatchObject({ status: 409 });
  });
});

describe("deleteUser", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends DELETE to /users/:id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, message: "User deleted successfully" }));
    vi.stubGlobal("fetch", fetchMock);

    await deleteUser("2");

    expect(fetchMock).toHaveBeenCalledWith("/api/users/2", expect.objectContaining({ method: "DELETE" }));
  });

  it("propagates ApiError when trying to delete a root user", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(403, { code: "T0004", message: "cannot delete a root user" })));

    await expect(deleteUser("1")).rejects.toMatchObject({ status: 403 });
  });
});

describe("resetUserPassword", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs /users/:id/reset-password and returns the new one-time password", async () => {
    const user = { id: "2", username: "bob", role: "user", must_change_password: true, active: true, status: "pending_first_login", created_at: "", updated_at: "" };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, user, password: "Nq7!vRxK2pLm" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await resetUserPassword("2");

    expect(fetchMock).toHaveBeenCalledWith("/api/users/2/reset-password", expect.objectContaining({ method: "POST" }));
    expect(result).toEqual({ user, password: "Nq7!vRxK2pLm" });
  });

  it("propagates ApiError when the caller cannot manage the target user", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(403, { error: "You cannot manage this user" })));

    await expect(resetUserPassword("2")).rejects.toMatchObject({ status: 403 });
  });
});

describe("setUserStatus", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PUTs {active} to /users/:id/status and returns the updated user", async () => {
    const user = { id: "2", username: "bob", role: "user", must_change_password: false, active: false, status: "disabled", created_at: "", updated_at: "" };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, user }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await setUserStatus("2", false);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/users/2/status",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ active: false }) })
    );
    expect(result).toEqual(user);
  });

  it("propagates ApiError when trying to change the root user's status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(403, { error: "Cannot change the root user's status" })));

    await expect(setUserStatus("1", false)).rejects.toMatchObject({ status: 403 });
  });
});
