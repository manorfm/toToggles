import { describe, expect, it } from "vitest";
import type { ActivationRule } from "../toggle/rule.js";
import { MatchListEvaluator } from "./matchlist.js";

// MatchListEvaluator is the one implementation shared by parameter, user_id, country, and canary
// — all four are "comma-separated allowlist, exact trimmed match" per the confirmed prototype
// hints, so this is a single reused type rather than four near-identical copies.
describe("MatchListEvaluator", () => {
  const evaluator = new MatchListEvaluator();

  it("matches one of the comma-separated values", () => {
    const rule: ActivationRule = { type: "parameter", value: "premium,enterprise" };
    expect(evaluator.evaluate(rule, "premium")).toBe(true);
    expect(evaluator.evaluate(rule, "enterprise")).toBe(true);
    expect(evaluator.evaluate(rule, "basic")).toBe(false);
  });

  it("trims whitespace around entries", () => {
    const rule: ActivationRule = { type: "country", value: " BR , US ,CA" };
    expect(evaluator.evaluate(rule, "BR")).toBe(true);
    expect(evaluator.evaluate(rule, "US")).toBe(true);
    expect(evaluator.evaluate(rule, "CA")).toBe(true);
    expect(evaluator.evaluate(rule, "br")).toBe(false);
  });

  it("never matches with no key at all", () => {
    const rule: ActivationRule = { type: "user_id", value: "user-1,user-2" };
    expect(evaluator.evaluate(rule, undefined)).toBe(false);
  });

  it("never matches a blank rule value", () => {
    const rule: ActivationRule = { type: "canary", value: "   " };
    expect(evaluator.evaluate(rule, "true")).toBe(false);
  });

  it("an empty-string key can match an empty list entry", () => {
    const rule: ActivationRule = { type: "canary", value: "true," };
    expect(evaluator.evaluate(rule, "")).toBe(true);
  });
});
