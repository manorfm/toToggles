package com.totoggle.client.strategy

import com.totoggle.client.model.ActivationRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class UserIdStrategyTest {

    private val strategy = UserIdStrategy()

    @Test
    fun `should return correct rule type`() {
        assertThat(strategy.getRuleType()).isEqualTo("user_id")
    }

    @Test
    fun `should return false when no user id provided`() {
        val rule = ActivationRule("user_id", "12,48,103")

        assertThat(strategy.evaluate(rule)).isFalse()
        assertThat(strategy.evaluate(rule, null)).isFalse()
    }

    @Test
    fun `should match any id in the comma-separated allowlist`() {
        val rule = ActivationRule("user_id", "12,48,103")

        assertThat(strategy.evaluate(rule, "12")).isTrue()
        assertThat(strategy.evaluate(rule, "48")).isTrue()
        assertThat(strategy.evaluate(rule, "103")).isTrue()
        assertThat(strategy.evaluate(rule, "99")).isFalse()
    }

    @Test
    fun `should return false when rule value is blank`() {
        val rule = ActivationRule("user_id", "")

        assertThat(strategy.evaluate(rule, "12")).isFalse()
    }
}
