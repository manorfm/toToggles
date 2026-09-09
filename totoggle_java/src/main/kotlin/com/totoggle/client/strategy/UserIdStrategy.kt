package com.totoggle.client.strategy

import com.totoggle.client.model.ActivationRule
import org.slf4j.LoggerFactory

/**
 * Strategy for evaluating user-ID-based activation rules.
 * The rule value is a comma-separated allowlist of user IDs (confirmed hint: "Comma-separated
 * user IDs"); the resolver supplies the current user's ID as a context value.
 */
class UserIdStrategy : ActivationStrategy {

    private val logger = LoggerFactory.getLogger(UserIdStrategy::class.java)

    override fun evaluate(rule: ActivationRule): Boolean {
        logger.debug("User ID strategy called without a user ID, returning false")
        return false
    }

    override fun evaluate(rule: ActivationRule, contextValue: String?): Boolean {
        val result = matchesCommaSeparatedList(rule.value, contextValue)
        logger.debug("User ID strategy evaluated: result={}", result)
        return result
    }

    override fun getRuleType(): String = ActivationRule.TYPE_USER_ID
}
