package com.totoggle.client.strategy

/**
 * Shared matching logic for rule types whose value is a comma-separated allowlist checked for
 * an exact (case-sensitive, trimmed) match against a caller-supplied context value.
 *
 * Attribute, user ID, country, and cohort rules share this exact shape. A single cohort value is
 * simply an allowlist with one entry.
 */
internal fun matchesCommaSeparatedList(ruleValue: String, candidate: String?): Boolean {
    if (candidate == null) return false
    if (ruleValue.isBlank()) return false
    return ruleValue.split(",").map { it.trim() }.any { it == candidate }
}
