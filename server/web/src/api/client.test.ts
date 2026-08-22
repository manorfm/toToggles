import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "./client";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the parsed body on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { data: "ok" })));

    const result = await apiFetch<{ data: string }>("/applications");

    expect(result).toEqual({ data: "ok" });
  });

  it("always sends credentials and JSON content-type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/applications");

    expect(fetchMock).toHaveBeenCalledWith(
      "/applications",
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      })
    );
  });

  it("throws ApiError using the legacy {error} shape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { success: false, error: "Invalid username or password" })));

    await expect(apiFetch("/auth/login")).rejects.toMatchObject({
      status: 401,
      message: "Invalid username or password",
    });
  });

  it("throws ApiError using the standard {code,message,details} shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(400, {
          code: "T0001",
          message: "validation failed",
          details: [{ field: "name", message: "Application name is required" }],
        })
      )
    );

    let caught: unknown;
    try {
      await apiFetch("/applications");
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(ApiError);
    const error = caught as ApiError;
    expect(error.status).toBe(400);
    expect(error.code).toBe("T0001");
    expect(error.details).toEqual([{ field: "name", message: "Application name is required" }]);
  });

  it("falls back to statusText when the error body is not JSON", async () => {
    const res = new Response("not json", { status: 500, statusText: "Internal Server Error" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res));

    await expect(apiFetch("/applications")).rejects.toMatchObject({
      status: 500,
      message: "Internal Server Error",
    });
  });

  it("returns undefined for empty/no-content responses", async () => {
    const res = new Response(null, { status: 200, headers: { "content-length": "0" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res));

    const result = await apiFetch("/secret-keys/abc");

    expect(result).toBeUndefined();
  });
});
