package com.totoggle.client.strategy

import com.totoggle.client.model.ActivationRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class CanaryStrategyTest {

    private val strategy = CanaryStrategy()

    @Test
    fun `should return correct rule type`() {
        assertThat(strategy.getRuleType()).isEqualTo("canary")
    }

    @Test
    fun `should return false when no cohort identifier provided`() {
        val rule = ActivationRule("canary", "true")

        assertThat(strategy.evaluate(rule)).isFalse()
        assertThat(strategy.evaluate(rule, null)).isFalse()
    }

    @Test
    fun `should match a simple boolean-style flag`() {
        val rule = ActivationRule("canary", "true")

        assertThat(strategy.evaluate(rule, "true")).isTrue()
        assertThat(strategy.evaluate(rule, "false")).isFalse()
    }

    @Test
    fun `should match any cohort in a comma-separated allowlist`() {
        val rule = ActivationRule("canary", "beta-ring,internal")

        assertThat(strategy.evaluate(rule, "beta-ring")).isTrue()
        assertThat(strategy.evaluate(rule, "internal")).isTrue()
        assertThat(strategy.evaluate(rule, "stable")).isFalse()
    }
}
