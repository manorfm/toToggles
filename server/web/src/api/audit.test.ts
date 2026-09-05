import { afterEach, describe, expect, it, vi } from "vitest";
import { listApplicationAudit, listAuditActors, listAuditLog } from "./audit";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const entry = {
  id: "au1",
  event_type: "toggle_deleted",
  category: "toggles",
  text: "Deleted toggle payments.card",
  target: "",
  team_id: "team-1",
  actor_id: "u1",
  actor_name: "alice",
  created_at: "2026-08-30T10:00:00Z",
};

describe("listAuditLog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls GET /audit with no query string when no options are given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: [entry], next_cursor: "" }));
    vi.stubGlobal("fetch", fetchMock);

    const page = await listAuditLog();

    expect(fetchMock).toHaveBeenCalledWith("/api/audit", expect.anything());
    expect(page.data).toEqual([entry]);
    expect(page.next_cursor).toBe("");
  });

  it("encodes category, cursor and limit as query params", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: [], next_cursor: "" }));
    vi.stubGlobal("fetch", fetchMock);

    await listAuditLog({ category: "keys", cursor: "abc123", limit: 10 });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("category=keys");
    expect(calledUrl).toContain("cursor=abc123");
    expect(calledUrl).toContain("limit=10");
  });

  it("returns next_cursor for pagination", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { data: [entry], next_cursor: "opaque-cursor" })));

    const page = await listAuditLog();

    expect(page.next_cursor).toBe("opaque-cursor");
  });

  // v2.6 §7: actor exato e intervalo de tempo — os dois novos filtros do AuditToolbar.
  it("encodes actorId and range as actor_id/range query params", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: [], next_cursor: "" }));
    vi.stubGlobal("fetch", fetchMock);

    await listAuditLog({ actorId: "u1", range: "7d" });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("actor_id=u1");
    expect(calledUrl).toContain("range=7d");
  });
});

describe("listAuditActors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls GET /audit/actors and returns the actor list", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: [{ id: "u1", name: "Alice" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const actors = await listAuditActors();

    expect(fetchMock).toHaveBeenCalledWith("/api/audit/actors", expect.anything());
    expect(actors).toEqual([{ id: "u1", name: "Alice" }]);
  });

  it("treats a missing data field as an empty list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, {})));

    expect(await listAuditActors()).toEqual([]);
  });
});

describe("listApplicationAudit", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls GET /applications/:id/audit with no query string when no options are given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: [entry], next_cursor: "" }));
    vi.stubGlobal("fetch", fetchMock);

    const page = await listApplicationAudit("app-1");

    expect(fetchMock).toHaveBeenCalledWith("/api/applications/app-1/audit", expect.anything());
    expect(page.data).toEqual([entry]);
  });

  it("encodes cursor and limit as query params", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: [], next_cursor: "" }));
    vi.stubGlobal("fetch", fetchMock);

    await listApplicationAudit("app-1", { cursor: "abc", limit: 10 });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("cursor=abc");
    expect(calledUrl).toContain("limit=10");
  });
});
