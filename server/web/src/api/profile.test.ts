import { afterEach, describe, expect, it, vi } from "vitest";
import { changeOwnPassword, getCurrentUser, logout } from "./profile";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("getCurrentUser", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("unwraps GET /profile's {success,user} envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          success: true,
          user: { id: "01ABC", username: "root", role: "root", must_change_password: false },
        })
      )
    );

    const user = await getCurrentUser();

    expect(user).toEqual({ id: "01ABC", username: "root", role: "root", must_change_password: false });
  });

  it("propagates ApiError (401) when there is no valid session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { error: "Authorization token required" })));

    await expect(getCurrentUser()).rejects.toMatchObject({ status: 401 });
  });
});

describe("logout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to /auth/logout", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, message: "Logged out successfully" }));
    vi.stubGlobal("fetch", fetchMock);

    await logout();

    expect(fetchMock).toHaveBeenCalledWith("/auth/logout", expect.objectContaining({ method: "POST" }));
  });
});

describe("changeOwnPassword", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts current/new password to /profile/change-password", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, message: "Password changed successfully" }));
    vi.stubGlobal("fetch", fetchMock);

    await changeOwnPassword({ currentPassword: "old", newPassword: "NovaSenha123" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/profile/change-password",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ current_password: "old", new_password: "NovaSenha123" }),
      })
    );
  });

  it("propagates ApiError when the current password is wrong", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { success: false, error: "Current password is incorrect" })));

    await expect(changeOwnPassword({ currentPassword: "wrong", newPassword: "NovaSenha123" })).rejects.toMatchObject({
      status: 401,
      message: "Current password is incorrect",
    });
  });
});
