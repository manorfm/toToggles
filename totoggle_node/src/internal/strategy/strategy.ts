import type { ActivationRule } from "../toggle/rule.js";

/**
 * Decides whether an activation rule matches its resolved context value. `undefined` means the
 * configured context key was unavailable, so contextual rules fail closed.
 */
export interface Evaluator {
  evaluate(rule: ActivationRule, key: string | undefined): boolean;
}

/** Dispatches a rule to the Evaluator registered for its type. */
export class Registry {
  private readonly evaluators = new Map<string, Evaluator>();

  register(type: string, evaluator: Evaluator): void {
    this.evaluators.set(type, evaluator);
  }

  /** An unregistered type throws rather than silently matching false — a typo'd or
   * server-added-but-unsupported rule type should never masquerade as "does not match". */
  evaluate(rule: ActivationRule, key: string | undefined): boolean {
    const evaluator = this.evaluators.get(rule.type);
    if (!evaluator) {
      throw new Error(`totoggle: no evaluator registered for rule type "${rule.type}"`);
    }
    return evaluator.evaluate(rule, key);
  }
}
