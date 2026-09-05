import { afterEach, describe, expect, it } from "vitest";
import { findByNameCaseInsensitive, isOnboarded, markOnboarded, suggestUsername } from "./onboarding";

describe("isOnboarded / markOnboarded", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("is false before markOnboarded is ever called", () => {
    expect(isOnboarded()).toBe(false);
  });

  it("becomes true after markOnboarded, and persists across the module (localStorage-backed)", () => {
    markOnboarded();

    expect(isOnboarded()).toBe(true);
    expect(window.localStorage.getItem("totoggle_v2_onboarded")).toBe("1");
  });
});

describe("suggestUsername", () => {
  it("uses slugUsername's suggestion when there is no collision", () => {
    expect(suggestUsername("Ana Ribeiro", [])).toBe("ana.ribeiro");
  });

  it("appends a numeric suffix on collision, incrementing until free", () => {
    expect(suggestUsername("Ana Ribeiro", ["ana.ribeiro"])).toBe("ana.ribeiro1");
    expect(suggestUsername("Ana Ribeiro", ["ana.ribeiro", "ana.ribeiro1"])).toBe("ana.ribeiro2");
  });

  it("falls back to a random-ish base when the name slugifies to nothing", () => {
    const username = suggestUsername("!!!", []);
    expect(username).toMatch(/^user/);
  });
});

describe("findByNameCaseInsensitive", () => {
  const items = [
    { id: "1", name: "Payments" },
    { id: "2", name: "Growth" },
  ];

  it("finds a match ignoring case", () => {
    expect(findByNameCaseInsensitive(items, "payments")).toEqual({ id: "1", name: "Payments" });
    expect(findByNameCaseInsensitive(items, "PAYMENTS")).toEqual({ id: "1", name: "Payments" });
  });

  it("returns undefined when nothing matches", () => {
    expect(findByNameCaseInsensitive(items, "Billing")).toBeUndefined();
  });
});
