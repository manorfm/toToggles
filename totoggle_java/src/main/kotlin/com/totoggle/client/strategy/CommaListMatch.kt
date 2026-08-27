package com.totoggle.client.strategy

/**
 * Shared matching logic for rule types whose value is a comma-separated allowlist checked for
 * an exact (case-sensitive, trimmed) match against a caller-supplied context value.
 *
 * Per the confirmed rule-type hints (lib/activationRuleTypes.ts in the frontend, ported from the
 * real prototype), "parameter", "user_id", "country", and "canary" all share this exact shape:
 * "Comma-separated values/user IDs/country codes matched against ..." / "Activates for the
 * canary cohort only" (a single-value allowlist is the degenerate case of the same rule).
 */
internal fun matchesCommaSeparatedList(ruleValue: String, candidate: String?): Boolean {
    if (candidate == null) return false
    if (ruleValue.isBlank()) return false
    return ruleValue.split(",").map { it.trim() }.any { it == candidate }
}
