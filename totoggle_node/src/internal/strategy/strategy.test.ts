import { describe, expect, it, vi } from "vitest";
import type { ActivationRule } from "../toggle/rule.js";
import type { Evaluator } from "./strategy.js";
import { Registry } from "./strategy.js";

describe("Registry", () => {
  it("dispatches to the evaluator registered for the rule's type", () => {
    const registry = new Registry();
    const stub: Evaluator = { evaluate: vi.fn(() => true) };
    registry.register("percentage", stub);

    const result = registry.evaluate({ type: "percentage", value: "50" }, "user-1");

    expect(result).toBe(true);
    expect(stub.evaluate).toHaveBeenCalledWith({ type: "percentage", value: "50" }, "user-1");
  });

  // undefined ("no parameter at all") must reach the evaluator distinct from an explicit empty
  // string — the caller-facing difference between isActive() and isActiveFor(path, "").
  it("propagates undefined distinct from an empty-string key", () => {
    const registry = new Registry();
    const stub: Evaluator = { evaluate: vi.fn(() => false) };
    registry.register("percentage", stub);

    registry.evaluate({ type: "percentage", value: "50" }, undefined);

    expect(stub.evaluate).toHaveBeenCalledWith({ type: "percentage", value: "50" }, undefined);
  });

  it("throws for an unregistered rule type", () => {
    const registry = new Registry();
    const rule: ActivationRule = { type: "made-up", value: "x" };

    expect(() => registry.evaluate(rule, "user-1")).toThrow(/made-up/);
  });
});
