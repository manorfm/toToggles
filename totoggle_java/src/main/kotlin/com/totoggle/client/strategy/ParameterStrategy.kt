package com.totoggle.client.strategy

import com.totoggle.client.model.ActivationRule
import org.slf4j.LoggerFactory

/**
 * Strategy for evaluating parameter-based activation rules.
 * This strategy activates toggles when the provided parameter matches one of the configured
 * values.
 *
 * The rule value is a comma-separated allowlist (confirmed hint: "Comma-separated values
 * matched against the request parameter"), e.g. a rule value of "premium,enterprise" matches
 * a parameter of either "premium" or "enterprise".
 */
class ParameterStrategy : ActivationStrategy {

    private val logger = LoggerFactory.getLogger(ParameterStrategy::class.java)

    override fun evaluate(rule: ActivationRule): Boolean {
        // Parameter strategy requires a parameter to compare against
        logger.debug("Parameter strategy called without parameter, returning false")
        return false
    }

    override fun evaluate(rule: ActivationRule, parameter: String?): Boolean {
        return try {
            val result = matchesCommaSeparatedList(rule.value, parameter)
            logger.debug("Parameter strategy: rule='${rule.value}', parameter='$parameter', result=$result")
            result
        } catch (e: Exception) {
            logger.error("Error evaluating parameter rule: ${rule.value} with parameter: $parameter", e)
            false
        }
    }

    override fun getRuleType(): String = ActivationRule.TYPE_PARAMETER
}