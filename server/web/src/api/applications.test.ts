import { afterEach, describe, expect, it, vi } from "vitest";
import { listApplications } from "./applications";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("listApplications", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches GET /applications and returns the raw list", async () => {
    const apps = [
      {
        id: "01APP0000000000000000001",
        name: "Checkout Web",
        created_at: "2026-08-19T10:00:00Z",
        updated_at: "2026-08-19T10:00:00Z",
        toggles_total: 12,
        toggles_enabled: 9,
        toggles_disabled: 3,
      },
    ];
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, apps));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listApplications();

    expect(fetchMock).toHaveBeenCalledWith("/applications", expect.objectContaining({ credentials: "include" }));
    expect(result).toEqual(apps);
  });

  it("propagates ApiError when the session is invalid", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { error: "Invalid token" })));

    await expect(listApplications()).rejects.toMatchObject({ status: 401, message: "Invalid token" });
  });
});
