import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCurrentUser } from "./useCurrentUser";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("useCurrentUser", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts loading, then resolves the authenticated user", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, { success: true, user: { id: "01ABC", username: "root", role: "root", must_change_password: false } })
      )
    );

    const { result } = renderHook(() => useCurrentUser());

    expect(result.current.status).toBe("loading");

    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(result.current.status === "authenticated" && result.current.user.username).toBe("root");
  });

  it("resolves to unauthenticated on a 401, without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { error: "Authorization token required" })));

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
  });

  it("surfaces a safe error message on unexpected failures, without leaking internals", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.status === "error" && result.current.message).not.toContain("TypeError");
  });
});
