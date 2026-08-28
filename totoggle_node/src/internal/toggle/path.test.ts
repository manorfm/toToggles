import { describe, expect, it } from "vitest";
import { Path } from "./path.js";

describe("Path", () => {
  it("accepts a valid multi-segment path", () => {
    const p = Path.parse("service.feature.flag");
    expect(p.toString()).toBe("service.feature.flag");
  });

  it("accepts a single-segment path", () => {
    const p = Path.parse("service");
    expect(p.toString()).toBe("service");
  });

  it("rejects an empty string", () => {
    expect(() => Path.parse("")).toThrow(/must not be empty/);
  });

  it.each([".service", "service.", "service..feature"])(
    "rejects an empty segment (%s)",
    (raw) => {
      expect(() => Path.parse(raw)).toThrow(/empty segment/);
    },
  );

  it("splits into dot-separated segments", () => {
    expect(Path.parse("service.feature.flag").segments()).toEqual([
      "service",
      "feature",
      "flag",
    ]);
  });

  it("a single-segment path has one segment", () => {
    expect(Path.parse("service").segments()).toEqual(["service"]);
  });

  it("returns every proper prefix, root first, for ancestorPaths", () => {
    const ancestors = Path.parse("t1.t2.t3").ancestorPaths();
    expect(ancestors.map((p) => p.toString())).toEqual(["t1", "t1.t2"]);
  });

  it("a single-segment path has no ancestors", () => {
    expect(Path.parse("t1").ancestorPaths()).toEqual([]);
  });

  it("a two-segment path has exactly one ancestor", () => {
    const ancestors = Path.parse("t1.t2").ancestorPaths();
    expect(ancestors.map((p) => p.toString())).toEqual(["t1"]);
  });

  it("equals another Path with the same raw value", () => {
    expect(Path.parse("t1.t2").equals(Path.parse("t1.t2"))).toBe(true);
    expect(Path.parse("t1.t2").equals(Path.parse("t1.t3"))).toBe(false);
  });

  it("serializes to JSON as the plain string", () => {
    expect(JSON.stringify(Path.parse("service.feature.flag"))).toBe(
      '"service.feature.flag"',
    );
  });
});
