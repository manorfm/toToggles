package com.totoggle.client.strategy

import com.totoggle.client.model.ActivationRule
import org.slf4j.LoggerFactory

/**
 * Strategy for evaluating country-based (geo targeting) activation rules.
 * The rule value is a comma-separated allowlist of ISO 3166-1 alpha-2 country codes (confirmed
 * hint: "ISO country codes, comma-separated"); the caller passes the current request's country
 * code as the `parameter`. Matching is exact and case-sensitive — callers should normalize case
 * (e.g. always uppercase) before calling, matching how the country codes are configured.
 */
class CountryStrategy : ActivationStrategy {

    private val logger = LoggerFactory.getLogger(CountryStrategy::class.java)

    override fun evaluate(rule: ActivationRule): Boolean {
        logger.debug("Country strategy called without a country code, returning false")
        return false
    }

    override fun evaluate(rule: ActivationRule, parameter: String?): Boolean {
        val result = matchesCommaSeparatedList(rule.value, parameter)
        logger.debug("Country strategy: rule='${rule.value}', country='$parameter', result=$result")
        return result
    }

    override fun getRuleType(): String = ActivationRule.TYPE_COUNTRY
}
