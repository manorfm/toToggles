import { afterEach, describe, expect, it, vi } from "vitest";
import { createUser, deleteUser, listUsers, updateUserRole } from "./users";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("listUsers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("unwraps GET /users's {success,users} envelope (root only)", async () => {
    const users = [{ id: "1", username: "alice", role: "admin", must_change_password: false, created_at: "", updated_at: "" }];
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

  it("propagates ApiError for non-root callers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(403, { error: "Forbidden" })));

    await expect(listUsers()).rejects.toMatchObject({ status: 403 });
  });
});

describe("createUser", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts username/role and returns the created user with its one-time password", async () => {
    const user = { id: "2", username: "bob", role: "admin", must_change_password: true, created_at: "", updated_at: "" };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { success: true, user, password: "Xk9$mQ2pLw#T" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createUser({ username: "bob", role: "admin" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/users",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ username: "bob", role: "admin" }) })
    );
    expect(result).toEqual({ user, password: "Xk9$mQ2pLw#T" });
  });

  it("propagates ApiError on a duplicate username", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(409, { code: "T0003", message: "username already exists" })));

    await expect(createUser({ username: "bob", role: "user" })).rejects.toMatchObject({ status: 409 });
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

describe("updateUserRole", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PUTs the new role and returns the updated user", async () => {
    const user = { id: "2", username: "bob", role: "user", must_change_password: false, created_at: "", updated_at: "" };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, message: "User updated successfully", user }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateUserRole("2", "user");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/users/2",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ role: "user" }) })
    );
    expect(result).toEqual(user);
  });

  it("propagates ApiError when assigning root to someone else's account", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(403, { code: "T0004", message: "only root can assign the root role to their own account" }))
    );

    await expect(updateUserRole("2", "root")).rejects.toMatchObject({ status: 403 });
  });
});
