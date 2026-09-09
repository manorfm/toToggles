package com.totoggle.client.strategy

import com.totoggle.client.model.ActivationRule

/** Matches an allowlist rule against the value resolved for an attributes.<name> context key. */
class AttributeStrategy : ActivationStrategy {
    override fun evaluate(rule: ActivationRule): Boolean = false

    override fun evaluate(rule: ActivationRule, contextValue: String?): Boolean =
        matchesCommaSeparatedList(rule.value, contextValue)

    override fun getRuleType(): String = ActivationRule.TYPE_ATTRIBUTE
}
