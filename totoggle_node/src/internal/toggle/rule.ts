/** The 7 activation-rule types the server supports. A string-literal union, not an enum — lets
 * a parsed `type` field compare structurally without an extra mapping step. */
export const RULE_TYPES = [
  "percentage",
  "parameter",
  "user_id",
  "ip",
  "country",
  "time",
  "canary",
] as const;

export type RuleType = (typeof RULE_TYPES)[number];

/** ActivationRule is a value object: type and value together define a condition, and neither is
 * meaningful alone (a value with no type, or vice versa, is never a valid rule). A plain
 * interface, not a class — it doubles as the fetch DTO shape with no separate mapping layer. */
export interface ActivationRule {
  readonly type: string;
  readonly value: string;
}

/** Reports whether this is "no rule configured" (both fields blank). */
export function isEmpty(rule: ActivationRule): boolean {
  return rule.type === "" && rule.value === "";
}

/** Reports whether this rule has both a type and a value — required for it to be evaluated at
 * all. */
export function isValid(rule: ActivationRule): boolean {
  return rule.type !== "" && rule.value !== "";
}
