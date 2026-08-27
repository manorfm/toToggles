package com.totoggle.client.strategy

import com.totoggle.client.model.ActivationRule
import org.slf4j.LoggerFactory

/**
 * Strategy for evaluating canary-release activation rules.
 * The rule value identifies the canary cohort(s) this toggle is active for (confirmed hint:
 * "Activates for the canary cohort only", placeholder "true") as a comma-separated allowlist;
 * the caller passes its own cohort/instance identifier as the `parameter` (e.g. "true" for a
 * simple on/off canary flag, or a named cohort id).
 */
class CanaryStrategy : ActivationStrategy {

    private val logger = LoggerFactory.getLogger(CanaryStrategy::class.java)

    override fun evaluate(rule: ActivationRule): Boolean {
        logger.debug("Canary strategy called without a cohort identifier, returning false")
        return false
    }

    override fun evaluate(rule: ActivationRule, parameter: String?): Boolean {
        val result = matchesCommaSeparatedList(rule.value, parameter)
        logger.debug("Canary strategy: rule='${rule.value}', cohort='$parameter', result=$result")
        return result
    }

    override fun getRuleType(): String = ActivationRule.TYPE_CANARY
}
