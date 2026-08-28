import { describe, expect, it } from "vitest";
import type { ActivationRule } from "../toggle/rule.js";
import { PercentageEvaluator } from "./percentage.js";

describe("PercentageEvaluator", () => {
  it("is deterministic for a given key", () => {
    const evaluator = new PercentageEvaluator();
    const rule: ActivationRule = { type: "percentage", value: "50" };

    const first = evaluator.evaluate(rule, "user-42");
    for (let i = 0; i < 20; i++) {
      expect(evaluator.evaluate(rule, "user-42")).toBe(first);
    }
  });

  it("different keys can land in different buckets", () => {
    const evaluator = new PercentageEvaluator();
    const rule: ActivationRule = { type: "percentage", value: "50" };

    const results = new Set<boolean>();
    for (let i = 0; i < 100; i++) {
      results.add(evaluator.evaluate(rule, `user-${i}`));
    }
    expect(results.size).toBe(2);
  });

  it("0% never activates a keyed call", () => {
    const evaluator = new PercentageEvaluator();
    const rule: ActivationRule = { type: "percentage", value: "0" };
    for (let i = 0; i < 50; i++) {
      expect(evaluator.evaluate(rule, `user-${i}`)).toBe(false);
    }
  });

  it("100% always activates a keyed call", () => {
    const evaluator = new PercentageEvaluator();
    const rule: ActivationRule = { type: "percentage", value: "100" };
    for (let i = 0; i < 50; i++) {
      expect(evaluator.evaluate(rule, `user-${i}`)).toBe(true);
    }
  });

  it("never activates for a non-numeric value", () => {
    const evaluator = new PercentageEvaluator();
    expect(evaluator.evaluate({ type: "percentage", value: "not-a-number" }, "user-1")).toBe(
      false,
    );
  });

  it("never activates for an out-of-range value", () => {
    const evaluator = new PercentageEvaluator();
    expect(evaluator.evaluate({ type: "percentage", value: "150" }, "user-1")).toBe(false);
    expect(evaluator.evaluate({ type: "percentage", value: "-1" }, "user-1")).toBe(false);
  });

  // With no key at all (Client.isActive, no parameter), there's nothing to key a deterministic
  // bucket on — falls back to the injected random source instead.
  it("uses the injected random source when there is no key", () => {
    const low = new PercentageEvaluator(() => 0.1); // -> bucket 10
    const rule: ActivationRule = { type: "percentage", value: "50" };
    expect(low.evaluate(rule, undefined)).toBe(true);

    const high = new PercentageEvaluator(() => 0.9); // -> bucket 90
    expect(high.evaluate(rule, undefined)).toBe(false);
  });
});
