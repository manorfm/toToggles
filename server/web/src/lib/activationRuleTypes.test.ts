import { describe, expect, it } from "vitest";
import { deriveInitialRuleState } from "./activationRuleTypes";
import type { ActivationRuleType, ToggleDetail } from "../types/toggle";

const baseToggle: ToggleDetail = {
  id: "1",
  value: "card",
  enabled: true,
  path: "payments.card",
  level: 1,
  parent_id: "0",
  app_id: "app1",
  has_activation_rule: false,
  activation_rule: null,
};

describe("deriveInitialRuleState", () => {
  it("returns null/empty when there is no rule and activation_rule is literally null", () => {
    expect(deriveInitialRuleState(baseToggle)).toEqual({ ruleType: null, ruleValue: "" });
  });

  it("returns null/empty when has_activation_rule is false, even if the server sends a non-null empty object", () => {
    // Confirmado ao vivo contra o servidor real: quando has_activation_rule é false, a API
    // devolve activation_rule: {type:"", value:""} — um objeto truthy, nunca null. Ler isso
    // com `?.type ?? null` resolveria pra "" (string vazia), um ActivationRuleType inválido,
    // em vez de null.
    const toggle: ToggleDetail = {
      ...baseToggle,
      has_activation_rule: false,
      activation_rule: { type: "" as ActivationRuleType, value: "" },
    };
    expect(deriveInitialRuleState(toggle)).toEqual({ ruleType: null, ruleValue: "" });
  });

  it("returns the real type/value when has_activation_rule is true", () => {
    const toggle: ToggleDetail = {
      ...baseToggle,
      has_activation_rule: true,
      activation_rule: { type: "percentage", value: "25" },
    };
    expect(deriveInitialRuleState(toggle)).toEqual({ ruleType: "percentage", ruleValue: "25" });
  });
});
