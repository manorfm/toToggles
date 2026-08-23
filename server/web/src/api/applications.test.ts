import { afterEach, describe, expect, it, vi } from "vitest";
import { createApplication, getApplication, listApplications } from "./applications";

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

describe("createApplication", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts name/team_id and returns the created application", async () => {
    const app = {
      id: "01APP0000000000000000001",
      name: "Checkout Web",
      created_at: "2026-08-19T10:00:00Z",
      updated_at: "2026-08-19T10:00:00Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, app));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createApplication({ name: "Checkout Web", teamId: "01TEAM01" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/applications",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Checkout Web", team_id: "01TEAM01" }) })
    );
    expect(result).toEqual({ kind: "created", application: app });
  });

  it("returns a pending_approval result on 202 (approval workflow intercepted the write)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(202, { approval_required: true, action_type: "application_create" }))
    );

    const result = await createApplication({ name: "Checkout Web", teamId: "01TEAM01" });

    expect(result).toEqual({ kind: "pending_approval", actionType: "application_create" });
  });

  it("propagates ApiError on a duplicate name (409)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(409, { code: "T0003", message: "application already exists" }))
    );

    await expect(createApplication({ name: "Checkout Web", teamId: "01TEAM01" })).rejects.toMatchObject({
      status: 409,
      message: "application already exists",
    });
  });
});

describe("getApplication", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches GET /applications/:id and returns the raw entity (with teams)", async () => {
    const app = {
      id: "01APP0000000000000000001",
      name: "Checkout Web",
      created_at: "",
      updated_at: "",
      teams: [{ id: "01TEAM01", name: "Payments Squad" }],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, app)));

    await expect(getApplication("01APP0000000000000000001")).resolves.toEqual(app);
  });

  it("propagates ApiError (404) for an unknown id", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(404, { code: "T0002", message: "application not found" })));

    await expect(getApplication("missing")).rejects.toMatchObject({ status: 404 });
  });
});
