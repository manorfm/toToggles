import { describe, expect, it } from "vitest";
import type { ActivationRule } from "./rule.js";
import { isEmpty, isValid, RULE_TYPES } from "./rule.js";

describe("ActivationRule", () => {
  it("is empty when both type and value are blank", () => {
    const rule: ActivationRule = { type: "", value: "" };
    expect(isEmpty(rule)).toBe(true);
    expect(isValid(rule)).toBe(false);
  });

  it("is neither empty nor invalid when both type and value are set", () => {
    const rule: ActivationRule = { type: "percentage", value: "25" };
    expect(isEmpty(rule)).toBe(false);
    expect(isValid(rule)).toBe(true);
  });

  it.each([
    ["both set", { type: "parameter", value: "premium" }, true],
    ["type only", { type: "parameter", value: "" }, false],
    ["value only", { type: "", value: "premium" }, false],
    ["neither", { type: "", value: "" }, false],
  ] as const)("isValid: %s", (_label, rule, expected) => {
    expect(isValid(rule)).toBe(expected);
  });

  // The 7 server-defined rule types (server/internal/app/domain/entity/activation_rule.go) —
  // locking these in as a regression test: a typo here would silently mean the client never
  // matches a rule the server actually configured.
  it("lists exactly the 7 server-defined rule types", () => {
    expect(RULE_TYPES).toEqual([
      "percentage",
      "parameter",
      "user_id",
      "ip",
      "country",
      "time",
      "canary",
    ]);
  });
});
