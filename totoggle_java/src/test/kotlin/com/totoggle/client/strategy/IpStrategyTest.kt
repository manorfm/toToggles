package com.totoggle.client.strategy

import com.totoggle.client.model.ActivationRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class IpStrategyTest {

    private val strategy = IpStrategy()

    @Test
    fun `should return correct rule type`() {
        assertThat(strategy.getRuleType()).isEqualTo("ip")
    }

    @Test
    fun `should return false when no ip provided`() {
        val rule = ActivationRule("ip", "10.0.0.0/24")

        assertThat(strategy.evaluate(rule)).isFalse()
        assertThat(strategy.evaluate(rule, null)).isFalse()
    }

    @Test
    fun `should match an exact IP`() {
        val rule = ActivationRule("ip", "192.168.1.1")

        assertThat(strategy.evaluate(rule, "192.168.1.1")).isTrue()
        assertThat(strategy.evaluate(rule, "192.168.1.2")).isFalse()
    }

    @Test
    fun `should match an IP inside a CIDR range`() {
        val rule = ActivationRule("ip", "10.0.0.0/24")

        assertThat(strategy.evaluate(rule, "10.0.0.1")).isTrue()
        assertThat(strategy.evaluate(rule, "10.0.0.255")).isTrue()
        assertThat(strategy.evaluate(rule, "10.0.1.1")).isFalse()
    }

    @Test
    fun `should match an IP inside a comma-separated mix of exact IPs and CIDR ranges`() {
        val rule = ActivationRule("ip", "192.168.1.1,10.0.0.0/24")

        assertThat(strategy.evaluate(rule, "192.168.1.1")).isTrue()
        assertThat(strategy.evaluate(rule, "10.0.0.42")).isTrue()
        assertThat(strategy.evaluate(rule, "8.8.8.8")).isFalse()
    }

    @Test
    fun `should respect a non-byte-aligned CIDR prefix`() {
        val rule = ActivationRule("ip", "10.0.0.0/22") // covers 10.0.0.0 - 10.0.3.255

        assertThat(strategy.evaluate(rule, "10.0.0.1")).isTrue()
        assertThat(strategy.evaluate(rule, "10.0.3.254")).isTrue()
        assertThat(strategy.evaluate(rule, "10.0.4.1")).isFalse()
    }

    @Test
    fun `should return false for a malformed candidate IP`() {
        val rule = ActivationRule("ip", "10.0.0.0/24")

        assertThat(strategy.evaluate(rule, "not-an-ip")).isFalse()
        assertThat(strategy.evaluate(rule, "999.0.0.1")).isFalse()
    }

    @Test
    fun `should return false when rule value is blank`() {
        val rule = ActivationRule("ip", "")

        assertThat(strategy.evaluate(rule, "10.0.0.1")).isFalse()
    }
}
