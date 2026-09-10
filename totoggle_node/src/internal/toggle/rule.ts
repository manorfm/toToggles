/** The 7 activation-rule types the server supports. A string-literal union, not an enum — lets
 * a parsed `type` field compare structurally without an extra mapping step. */
export const RULE_TYPES = [
  "percentage",
  "attribute",
  "user_id",
  "ip",
  "country",
  "time",
  "cohort",
] as const;

export type RuleType = (typeof RULE_TYPES)[number];

/** ActivationRule is a value object: type and value together define a condition, and neither is
 * meaningful alone (a value with no type, or vice versa, is never a valid rule). A plain
 * interface, not a class — it doubles as the fetch DTO shape with no separate mapping layer. */
export interface ActivationRule {
  readonly type: string;
  readonly value: string;
  readonly config?: { readonly context_key?: string } | null;
}

/**
 * Validates the type/context-key pair before a resolver is touched. Catalogue data crosses a
 * trust boundary, so SDK evaluation repeats this small canonical contract and fails closed when
 * an invalid server payload somehow reaches the cache.
 */
export function hasCanonicalContextKey(rule: ActivationRule): boolean {
  if (rule.type === "time") return rule.config === undefined || rule.config === null;

  const key = rule.config?.context_key;
  if (key === undefined || key === "") return false;
  if (key.startsWith("attributes.")) {
    return key.length > "attributes.".length && (rule.type === "percentage" || rule.type === "attribute");
  }
  return (rule.type === "percentage" && key === "rollout_key")
    || (rule.type === "user_id" && key === "user_id")
    || (rule.type === "ip" && key === "ip")
    || (rule.type === "country" && key === "country")
    || (rule.type === "cohort" && key === "cohort");
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
