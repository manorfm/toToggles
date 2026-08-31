import { describe, expect, it } from "vitest";
import { applicationAccent, creationOrderIndex, HUES_CYCLE } from "./applicationAccent";

describe("applicationAccent", () => {
  it("cycles through the real 6-hue palette by index", () => {
    HUES_CYCLE.forEach((hue, i) => {
      expect(applicationAccent(i).accent).toBe(`oklch(0.75 0.15 ${hue})`);
      expect(applicationAccent(i).soft).toBe(`oklch(0.75 0.15 ${hue} / 0.15)`);
    });
  });

  it("wraps around after the 6th application", () => {
    expect(applicationAccent(6)).toEqual(applicationAccent(0));
    expect(applicationAccent(7)).toEqual(applicationAccent(1));
  });
});

describe("creationOrderIndex", () => {
  it("assigns 0 to the oldest application regardless of list order", () => {
    const apps = [
      { id: "newest", created_at: "2026-08-30T10:00:00Z" },
      { id: "oldest", created_at: "2026-08-01T10:00:00Z" },
      { id: "middle", created_at: "2026-08-15T10:00:00Z" },
    ];

    const index = creationOrderIndex(apps);

    expect(index.get("oldest")).toBe(0);
    expect(index.get("middle")).toBe(1);
    expect(index.get("newest")).toBe(2);
  });

  it("returns an empty map for an empty list", () => {
    expect(creationOrderIndex([]).size).toBe(0);
  });
});
