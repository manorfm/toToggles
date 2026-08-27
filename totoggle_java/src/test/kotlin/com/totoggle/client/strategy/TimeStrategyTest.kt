package com.totoggle.client.strategy

import com.totoggle.client.model.ActivationRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class TimeStrategyTest {

    private fun strategyAt(time: String): TimeStrategy {
        val instant = Instant.parse("2026-01-01T${time}:00Z")
        return TimeStrategy(Clock.fixed(instant, ZoneOffset.UTC))
    }

    @Test
    fun `should return correct rule type`() {
        assertThat(TimeStrategy().getRuleType()).isEqualTo("time")
    }

    @Test
    fun `should be active inside a same-day window`() {
        val rule = ActivationRule("time", "09:00-18:00")

        assertThat(strategyAt("09:00").evaluate(rule)).isTrue()
        assertThat(strategyAt("12:00").evaluate(rule)).isTrue()
        assertThat(strategyAt("17:59").evaluate(rule)).isTrue()
    }

    @Test
    fun `should be inactive outside a same-day window`() {
        val rule = ActivationRule("time", "09:00-18:00")

        assertThat(strategyAt("08:59").evaluate(rule)).isFalse()
        assertThat(strategyAt("18:00").evaluate(rule)).isFalse() // end is exclusive
        assertThat(strategyAt("23:00").evaluate(rule)).isFalse()
    }

    @Test
    fun `should wrap past midnight for an overnight window`() {
        val rule = ActivationRule("time", "22:00-06:00")

        assertThat(strategyAt("23:00").evaluate(rule)).isTrue()
        assertThat(strategyAt("02:00").evaluate(rule)).isTrue()
        assertThat(strategyAt("22:00").evaluate(rule)).isTrue()
        assertThat(strategyAt("12:00").evaluate(rule)).isFalse()
        assertThat(strategyAt("06:00").evaluate(rule)).isFalse() // end is exclusive
    }

    @Test
    fun `should return false for a malformed window`() {
        val rule = ActivationRule("time", "not-a-window")

        assertThat(strategyAt("12:00").evaluate(rule)).isFalse()
    }

    @Test
    fun `should ignore the parameter argument`() {
        val rule = ActivationRule("time", "09:00-18:00")

        assertThat(strategyAt("12:00").evaluate(rule, "anything")).isTrue()
    }
}
