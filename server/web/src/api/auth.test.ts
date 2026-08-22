import { afterEach, describe, expect, it, vi } from "vitest";
import { checkFirstAccess, login } from "./auth";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("login", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an authenticated result on normal login", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          success: true,
          user: { id: "01ABC", username: "root", role: "root", must_change_password: false },
        })
      )
    );

    const result = await login("root", "correct-password");

    expect(result).toEqual({
      kind: "authenticated",
      user: { id: "01ABC", username: "root", role: "root", must_change_password: false },
    });
  });

  it("returns a must_change_password result on forced reset", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          success: true,
          must_change_password: true,
          user_id: "01ABC",
          username: "root",
        })
      )
    );

    const result = await login("root", "temporary-password");

    expect(result).toEqual({ kind: "must_change_password", userId: "01ABC", username: "root" });
  });

  it("propagates ApiError on invalid credentials", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { success: false, error: "Invalid username or password" })));

    await expect(login("root", "wrong")).rejects.toMatchObject({ status: 401, message: "Invalid username or password" });
  });
});

describe("checkFirstAccess", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns true when the server reports first access", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { first_access: true, user_count: 0 })));

    await expect(checkFirstAccess()).resolves.toBe(true);
  });

  it("returns false instead of throwing when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network error")));

    await expect(checkFirstAccess()).resolves.toBe(false);
  });
});
