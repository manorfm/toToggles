import { afterEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser, logout } from "./profile";

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
