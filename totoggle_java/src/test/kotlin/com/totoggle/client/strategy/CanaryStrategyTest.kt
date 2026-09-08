package com.totoggle.client.strategy

import com.totoggle.client.model.ActivationRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class CohortStrategyTest {

    private val strategy = CohortStrategy()

    @Test
    fun `should return correct rule type`() {
        assertThat(strategy.getRuleType()).isEqualTo("cohort")
    }

    @Test
    fun `should return false when no cohort identifier provided`() {
        val rule = ActivationRule("cohort", "canary")

        assertThat(strategy.evaluate(rule)).isFalse()
        assertThat(strategy.evaluate(rule, null)).isFalse()
    }

    @Test
    fun `should match a named cohort`() {
        val rule = ActivationRule("cohort", "canary")

        assertThat(strategy.evaluate(rule, "canary")).isTrue()
        assertThat(strategy.evaluate(rule, "stable")).isFalse()
    }

    @Test
    fun `should match any cohort in a comma-separated allowlist`() {
        val rule = ActivationRule("cohort", "beta-ring,internal")

        assertThat(strategy.evaluate(rule, "beta-ring")).isTrue()
        assertThat(strategy.evaluate(rule, "internal")).isTrue()
        assertThat(strategy.evaluate(rule, "stable")).isFalse()
    }
}
