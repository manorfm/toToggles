import { afterEach, describe, expect, it, vi } from "vitest";
import { createTeam, listTeams } from "./teams";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("listTeams", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("unwraps GET /teams's {success,teams} envelope", async () => {
    const teams = [
      {
        id: "01TEAM01",
        name: "Payments Squad",
        description: "Owns payments",
        created_at: "",
        updated_at: "",
        user_count: 3,
        application_count: 1,
      },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, teams })));

    await expect(listTeams()).resolves.toEqual(teams);
  });

  it("returns an empty array when the API omits 'teams' (nil slice, no teams yet)", async () => {
    // GET /teams com zero times retorna {"success":true} sem a chave "teams" —
    // confirmado contra o servidor real (slice nil no Go, não serializa como []).
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true })));

    await expect(listTeams()).resolves.toEqual([]);
  });

  it("propagates ApiError when the caller isn't root", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(403, { success: false, error: "Forbidden" })));

    await expect(listTeams()).rejects.toMatchObject({ status: 403 });
  });
});

describe("createTeam", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts name/description and unwraps the created team", async () => {
    const team = { id: "01TEAM02", name: "Data Platform", description: "", created_at: "", updated_at: "" };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { success: true, team }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createTeam({ name: "Data Platform" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/teams",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Data Platform", description: "" }) })
    );
    expect(result).toEqual(team);
  });

  it("propagates ApiError on a duplicate name", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(400, { success: false, error: "team name already exists" })));

    await expect(createTeam({ name: "Payments Squad" })).rejects.toMatchObject({ status: 400, message: "team name already exists" });
  });
});
