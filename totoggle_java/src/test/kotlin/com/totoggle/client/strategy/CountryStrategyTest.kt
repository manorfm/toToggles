package com.totoggle.client.strategy

import com.totoggle.client.model.ActivationRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class CountryStrategyTest {

    private val strategy = CountryStrategy()

    @Test
    fun `should return correct rule type`() {
        assertThat(strategy.getRuleType()).isEqualTo("country")
    }

    @Test
    fun `should return false when no country code provided`() {
        val rule = ActivationRule("country", "BR,PT")

        assertThat(strategy.evaluate(rule)).isFalse()
        assertThat(strategy.evaluate(rule, null)).isFalse()
    }

    @Test
    fun `should match any code in the comma-separated allowlist`() {
        val rule = ActivationRule("country", "BR,PT")

        assertThat(strategy.evaluate(rule, "BR")).isTrue()
        assertThat(strategy.evaluate(rule, "PT")).isTrue()
        assertThat(strategy.evaluate(rule, "US")).isFalse()
    }

    @Test
    fun `should be case sensitive`() {
        val rule = ActivationRule("country", "BR")

        assertThat(strategy.evaluate(rule, "br")).isFalse()
    }
}
