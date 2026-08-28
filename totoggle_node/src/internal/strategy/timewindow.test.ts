import { describe, expect, it } from "vitest";
import type { ActivationRule } from "../toggle/rule.js";
import { TimeWindowEvaluator } from "./timewindow.js";

function at(hhmm: string): () => Date {
  const [hours, minutes] = hhmm.split(":").map(Number);
  const date = new Date(2026, 0, 1, hours, minutes, 0, 0);
  return () => date;
}

describe("TimeWindowEvaluator", () => {
  const rule: ActivationRule = { type: "time", value: "09:00-18:00" };

  it("matches within the window", () => {
    expect(new TimeWindowEvaluator(at("12:00")).evaluate(rule, undefined)).toBe(true);
  });

  it("does not match before the window", () => {
    expect(new TimeWindowEvaluator(at("08:59")).evaluate(rule, undefined)).toBe(false);
  });

  it("end is exclusive", () => {
    expect(new TimeWindowEvaluator(at("18:00")).evaluate(rule, undefined)).toBe(false);
  });

  it("start is inclusive", () => {
    expect(new TimeWindowEvaluator(at("09:00")).evaluate(rule, undefined)).toBe(true);
  });

  it("wraps past midnight for an overnight window", () => {
    const overnight: ActivationRule = { type: "time", value: "22:00-06:00" };
    expect(new TimeWindowEvaluator(at("23:00")).evaluate(overnight, undefined)).toBe(true);
    expect(new TimeWindowEvaluator(at("02:00")).evaluate(overnight, undefined)).toBe(true);
    expect(new TimeWindowEvaluator(at("12:00")).evaluate(overnight, undefined)).toBe(false);
  });

  it("never matches a malformed window", () => {
    const evaluator = new TimeWindowEvaluator(at("12:00"));
    expect(evaluator.evaluate({ type: "time", value: "not-a-window" }, undefined)).toBe(false);
    expect(evaluator.evaluate({ type: "time", value: "9am-6pm" }, undefined)).toBe(false);
  });

  it("never matches a value with no dash separator at all", () => {
    const evaluator = new TimeWindowEvaluator(at("12:00"));
    expect(evaluator.evaluate({ type: "time", value: "nodash" }, undefined)).toBe(false);
  });

  it("never matches an out-of-range hour or minute", () => {
    const evaluator = new TimeWindowEvaluator(at("12:00"));
    expect(evaluator.evaluate({ type: "time", value: "25:00-18:00" }, undefined)).toBe(false);
    expect(evaluator.evaluate({ type: "time", value: "09:00-12:99" }, undefined)).toBe(false);
  });

  it("never matches when only the end of the window is malformed", () => {
    const evaluator = new TimeWindowEvaluator(at("12:00"));
    expect(evaluator.evaluate({ type: "time", value: "09:00-6pm" }, undefined)).toBe(false);
  });

  it("defaults to the real clock when none is injected", () => {
    const evaluator = new TimeWindowEvaluator();
    expect(evaluator.evaluate({ type: "time", value: "00:00-23:59" }, undefined)).toBe(true);
  });
});
