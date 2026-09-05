import { describe, expect, it } from "vitest";
import { searchCommands } from "./commandPalette";
import type { CommandPaletteData } from "./commandPalette";

function data(overrides: Partial<CommandPaletteData> = {}): CommandPaletteData {
  return {
    apps: [],
    toggles: [],
    teams: [],
    people: [],
    ...overrides,
  };
}

describe("searchCommands", () => {
  // v2.6 §6.1/§6.2: porta a computação de hits do CommandPalette real (app.jsx) — 4 grupos
  // independentes, cada um com seu próprio cap (5/8/4/4), Applications sempre visível (mesmo
  // sem busca, mostra as primeiras 5), os outros 3 só aparecem depois de digitar algo.
  it("shows the first 5 apps when the query is empty, and no other group", () => {
    const apps = Array.from({ length: 7 }, (_, i) => ({ id: `app-${i}`, name: `App ${i}` }));

    const hits = searchCommands("", data({ apps, toggles: [{ appId: "app-0", appName: "App 0", path: "a.b" }] }));

    expect(hits.apps).toHaveLength(5);
    expect(hits.apps[0]).toEqual({ id: "app-0", name: "App 0" });
    expect(hits.toggles).toEqual([]);
    expect(hits.teams).toEqual([]);
    expect(hits.people).toEqual([]);
  });

  it("filters apps by name, case-insensitively, capped at 5", () => {
    const apps = [
      { id: "1", name: "Checkout Web" },
      { id: "2", name: "checkout Mobile" },
      { id: "3", name: "Billing" },
    ];

    const hits = searchCommands("checkout", data({ apps }));

    expect(hits.apps.map((a) => a.id)).toEqual(["1", "2"]);
  });

  it("filters toggles by dotted path, capped at 8", () => {
    const toggles = Array.from({ length: 10 }, (_, i) => ({ appId: "app-1", appName: "App 1", path: `payments.method${i}` }));
    toggles.push({ appId: "app-2", appName: "App 2", path: "shipping.rate" });

    const hits = searchCommands("payments", data({ toggles }));

    expect(hits.toggles).toHaveLength(8);
    expect(hits.toggles.every((t) => t.path.startsWith("payments"))).toBe(true);
  });

  it("filters teams by name, capped at 4", () => {
    const teams = Array.from({ length: 6 }, (_, i) => ({ id: `t${i}`, name: `Squad ${i}` }));

    const hits = searchCommands("squad", data({ teams }));

    expect(hits.teams).toHaveLength(4);
  });

  it("filters people by name or username, capped at 4", () => {
    const people = [
      { id: "1", name: "Alice Root", username: "alice" },
      { id: "2", name: "Bob", username: "alice2" },
      { id: "3", name: "Carol", username: "carol" },
    ];

    const hits = searchCommands("alice", data({ people }));

    expect(hits.people.map((p) => p.id)).toEqual(["1", "2"]);
  });

  it("returns no toggle/team/people hits for an empty query, even if data is non-empty", () => {
    const hits = searchCommands("   ", data({
      toggles: [{ appId: "a", appName: "A", path: "x.y" }],
      teams: [{ id: "t", name: "Team" }],
      people: [{ id: "u", name: "User", username: "user" }],
    }));

    expect(hits.toggles).toEqual([]);
    expect(hits.teams).toEqual([]);
    expect(hits.people).toEqual([]);
  });
});
