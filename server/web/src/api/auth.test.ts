import { afterEach, describe, expect, it, vi } from "vitest";
import { changePasswordFirstTime, checkFirstAccess, login } from "./auth";

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

describe("changePasswordFirstTime", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts user_id/username plus the passwords to /auth/change-password-first-time", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, message: "Password changed successfully" }));
    vi.stubGlobal("fetch", fetchMock);

    await changePasswordFirstTime({ userId: "01ABC", username: "root", currentPassword: "temp", newPassword: "NovaSenha123" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/auth/change-password-first-time",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ user_id: "01ABC", username: "root", current_password: "temp", new_password: "NovaSenha123" }),
      })
    );
  });

  it("propagates ApiError when the current password is wrong", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { success: false, error: "Invalid current password" })));

    await expect(
      changePasswordFirstTime({ userId: "01ABC", username: "root", currentPassword: "wrong", newPassword: "NovaSenha123" })
    ).rejects.toMatchObject({ status: 401, message: "Invalid current password" });
  });
});
