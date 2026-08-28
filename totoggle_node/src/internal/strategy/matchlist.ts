import type { ActivationRule } from "../toggle/rule.js";
import type { Evaluator } from "./strategy.js";

/**
 * Implements the "comma-separated allowlist, exact trimmed match" shape shared by four
 * otherwise-identical rule types (parameter, user_id, country, canary — the confirmed prototype
 * hints describe all four the same way). One implementation registered under all four types,
 * instead of four copies of the same logic.
 */
export class MatchListEvaluator implements Evaluator {
  evaluate(rule: ActivationRule, key: string | undefined): boolean {
    if (key === undefined) {
      return false;
    }
    if (rule.value.trim() === "") {
      return false;
    }
    return rule.value.split(",").some((entry) => entry.trim() === key);
  }
}
