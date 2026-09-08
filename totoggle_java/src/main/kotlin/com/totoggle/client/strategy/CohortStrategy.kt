package com.totoggle.client.strategy

import com.totoggle.client.model.ActivationRule

/** Matches a configured deployment/request cohort such as `canary` or `beta`. */
class CohortStrategy : ActivationStrategy {
    override fun evaluate(rule: ActivationRule): Boolean = false
    override fun evaluate(rule: ActivationRule, parameter: String?): Boolean = matchesCommaSeparatedList(rule.value, parameter)
    override fun getRuleType(): String = ActivationRule.TYPE_COHORT
}
