import { describe, expect, it } from "vitest";
import { applicationGlyph } from "./applicationAccent";

describe("applicationGlyph", () => {
  it("takes the first letter of up to two words, uppercased", () => {
    expect(applicationGlyph("Checkout Service")).toBe("CS");
    expect(applicationGlyph("Mobile App")).toBe("MA");
  });

  it("ignores extra words past the second", () => {
    expect(applicationGlyph("Admin Console Legacy")).toBe("AC");
  });

  it("uses just one letter for a single-word name", () => {
    expect(applicationGlyph("Billing")).toBe("B");
  });

  it("collapses repeated whitespace between words", () => {
    expect(applicationGlyph("Checkout   Service")).toBe("CS");
  });

  it("falls back to 'AP' for an empty or whitespace-only name", () => {
    expect(applicationGlyph("")).toBe("AP");
    expect(applicationGlyph("   ")).toBe("AP");
  });
});
