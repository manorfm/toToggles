import { afterEach, describe, expect, it, vi } from "vitest";
import { listUsers } from "./users";

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

    expect(fetchMock).toHaveBeenCalledWith("/users", expect.anything());
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
