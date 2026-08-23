import { afterEach, describe, expect, it, vi } from "vitest";
import { addTeamMember, createTeam, deleteTeam, listMyTeams, listTeamMembers, listTeamOptions, listTeams, removeTeamMember } from "./teams";

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

describe("deleteTeam", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends DELETE to /teams/:id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, message: "Team deleted successfully" }));
    vi.stubGlobal("fetch", fetchMock);

    await deleteTeam("team1");

    expect(fetchMock).toHaveBeenCalledWith("/teams/team1", expect.objectContaining({ method: "DELETE" }));
  });

  it("propagates ApiError when the caller isn't root", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(403, { success: false, error: "Forbidden" })));

    await expect(deleteTeam("team1")).rejects.toMatchObject({ status: 403 });
  });
});

describe("listMyTeams", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("unwraps GET /profile/teams's {success,teams} envelope (works for any role)", async () => {
    const teams = [{ id: "01TEAM01", name: "Payments Squad", description: "", created_at: "", updated_at: "" }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, teams })));

    await expect(listMyTeams()).resolves.toEqual(teams);
  });

  it("returns an empty array when 'teams' is omitted", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true })));

    await expect(listMyTeams()).resolves.toEqual([]);
  });
});

describe("listTeamOptions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses GET /teams (full list) for root", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, teams: [{ id: "1", name: "A" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const options = await listTeamOptions(true);

    expect(fetchMock).toHaveBeenCalledWith("/teams", expect.anything());
    expect(options).toEqual([{ id: "1", name: "A" }]);
  });

  it("uses GET /profile/teams (own teams only) for non-root", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, teams: [{ id: "2", name: "B" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const options = await listTeamOptions(false);

    expect(fetchMock).toHaveBeenCalledWith("/profile/teams", expect.anything());
    expect(options).toEqual([{ id: "2", name: "B" }]);
  });
});

describe("listTeamMembers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("unwraps GET /teams/:id/users's {success,users} envelope", async () => {
    const users = [{ id: "1", username: "alice", role: "admin", must_change_password: false, created_at: "", updated_at: "" }];
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, users }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listTeamMembers("team1");

    expect(fetchMock).toHaveBeenCalledWith("/teams/team1/users", expect.anything());
    expect(result).toEqual(users);
  });

  it("returns an empty array when 'users' is omitted", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true })));

    await expect(listTeamMembers("team1")).resolves.toEqual([]);
  });
});

describe("addTeamMember", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts user_id to /teams/:id/users", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, message: "User added to team successfully" }));
    vi.stubGlobal("fetch", fetchMock);

    await addTeamMember("team1", "user1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/teams/team1/users",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ user_id: "user1" }) })
    );
  });

  it("propagates ApiError when the user is already a member", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(400, { success: false, error: "user already a member" })));

    await expect(addTeamMember("team1", "user1")).rejects.toMatchObject({ status: 400 });
  });
});

describe("removeTeamMember", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends DELETE to /teams/:id/users/:userId", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, message: "User removed from team successfully" }));
    vi.stubGlobal("fetch", fetchMock);

    await removeTeamMember("team1", "user1");

    expect(fetchMock).toHaveBeenCalledWith("/teams/team1/users/user1", expect.objectContaining({ method: "DELETE" }));
  });
});
