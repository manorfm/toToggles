import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadCSV, toCSV } from "./csvExport";
import type { AuditLogEntry } from "../types/audit";

function entry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: "au1",
    event_type: "toggle_deleted",
    category: "toggles",
    text: "Deleted toggle <b>payments.card</b>",
    target: "Checkout Web",
    team_id: "team-1",
    application_id: null,
    before: null,
    after: null,
    actor_id: "u1",
    actor_name: "Alice Ribeiro",
    created_at: "2026-08-30T10:00:00.000Z",
    ...overrides,
  };
}

describe("toCSV", () => {
  it("has a header row naming when/actor/type/text/target", () => {
    const csv = toCSV([]);
    expect(csv).toBe('"When","Actor","Type","Text","Target"');
  });

  it("strips <b>/<i> markup from the text column", () => {
    const csv = toCSV([entry({ text: "Disabled <b>experiments</b> branch <i>(no effect — x is off)</i>" })]);
    expect(csv).toContain('"Disabled experiments branch (no effect — x is off)"');
  });

  it("quotes every field and escapes embedded quotes by doubling them", () => {
    const csv = toCSV([entry({ actor_name: 'Ana "the boss" Ribeiro' })]);
    expect(csv).toContain('"Ana ""the boss"" Ribeiro"');
  });

  it("emits one row per entry, in the given order, separated by CRLF", () => {
    const csv = toCSV([entry({ id: "1", event_type: "toggle_created" }), entry({ id: "2", event_type: "toggle_deleted" })]);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[1]).toContain("toggle_created");
    expect(lines[2]).toContain("toggle_deleted");
  });
});

describe("downloadCSV", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an object URL, triggers a click on a download anchor, and revokes the URL", () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:fake-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadCSV([entry()], "totoggle-history.csv");

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake-url");

    vi.unstubAllGlobals();
  });
});
