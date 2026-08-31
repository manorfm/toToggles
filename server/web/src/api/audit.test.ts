import { afterEach, describe, expect, it, vi } from "vitest";
import { listAuditLog } from "./audit";

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
});
