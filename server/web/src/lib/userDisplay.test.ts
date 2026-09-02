import { describe, expect, it } from "vitest";
import { initialsOf, slugUsername } from "./userDisplay";

describe("slugUsername", () => {
  it("lowercases and joins the first two name segments with a dot", () => {
    expect(slugUsername("Ana Ribeiro")).toBe("ana.ribeiro");
  });

  it("strips accents", () => {
    expect(slugUsername("José Ávila")).toBe("jose.avila");
  });

  it("ignores a third name onward", () => {
    expect(slugUsername("Ana Maria Ribeiro")).toBe("ana.maria");
  });

  it("uses a single segment for a one-word name", () => {
    expect(slugUsername("Cher")).toBe("cher");
  });

  it("collapses non-alphanumeric runs into a single dot and trims edges", () => {
    expect(slugUsername("  Anne-Marie O'Connor  ")).toBe("anne.marie");
  });

  it("returns an empty string for an empty name", () => {
    expect(slugUsername("")).toBe("");
  });
});

describe("initialsOf", () => {
  it("takes the first letter of up to two words, uppercased", () => {
    expect(initialsOf("Ana Ribeiro")).toBe("AR");
  });

  it("uses just one letter for a single-word name", () => {
    expect(initialsOf("Root")).toBe("R");
  });

  it("ignores extra words past the second", () => {
    expect(initialsOf("Ana Maria Ribeiro")).toBe("AM");
  });
});
