package com.totoggle.client.strategy

import com.totoggle.client.exception.StrategyNotFoundException
import com.totoggle.client.model.ActivationRule
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

class StrategyFactoryTest {
    
    private lateinit var factory: StrategyFactory
    
    @BeforeEach
    fun setUp() {
        factory = StrategyFactory()
    }
    
    @Test
    fun `should initialize with a strategy for all 7 server-supported rule types`() {
        val registeredTypes = factory.getRegisteredRuleTypes()

        assertThat(registeredTypes).containsExactlyInAnyOrder(
            "percentage", "parameter", "user_id", "ip", "country", "time", "canary"
        )
    }
    
    @Test
    fun `should get correct strategy for percentage rule`() {
        val strategy = factory.getStrategy("percentage")
        
        assertThat(strategy).isInstanceOf(PercentageStrategy::class.java)
        assertThat(strategy.getRuleType()).isEqualTo("percentage")
    }
    
    @Test
    fun `should get correct strategy for parameter rule`() {
        val strategy = factory.getStrategy("parameter")
        
        assertThat(strategy).isInstanceOf(ParameterStrategy::class.java)
        assertThat(strategy.getRuleType()).isEqualTo("parameter")
    }
    
    @Test
    fun `should throw exception for unknown rule type`() {
        assertThatThrownBy { factory.getStrategy("unknown") }
            .isInstanceOf(StrategyNotFoundException::class.java)
            .hasMessageContaining("unknown")
    }
    
    @Test
    fun `should check if strategy is available`() {
        assertThat(factory.hasStrategy("percentage")).isTrue()
        assertThat(factory.hasStrategy("parameter")).isTrue()
        assertThat(factory.hasStrategy("unknown")).isFalse()
    }
    
    @Test
    fun `should register custom strategy`() {
        val customStrategy = object : ActivationStrategy {
            override fun evaluate(rule: ActivationRule): Boolean = true
            override fun evaluate(rule: ActivationRule, parameter: String?): Boolean = true
            override fun getRuleType(): String = "custom"
        }
        
        factory.registerStrategy(customStrategy)
        
        assertThat(factory.hasStrategy("custom")).isTrue()
        assertThat(factory.getStrategy("custom")).isSameAs(customStrategy)
        assertThat(factory.getRegisteredRuleTypes()).contains("custom")
    }
    
    @Test
    fun `should evaluate empty rule as true`() {
        val emptyRule = ActivationRule.empty()
        
        val result = factory.evaluate(emptyRule)
        
        assertThat(result).isTrue()
    }
    
    @Test
    fun `should evaluate invalid rule as false`() {
        val invalidRule = ActivationRule("", "value")
        
        val result = factory.evaluate(invalidRule)
        
        assertThat(result).isFalse()
    }
    
    @Test
    fun `should evaluate valid percentage rule`() {
        val rule = ActivationRule("percentage", "100")
        
        val result = factory.evaluate(rule)
        
        assertThat(result).isTrue()
    }
    
    @Test
    fun `should evaluate valid parameter rule`() {
        val rule = ActivationRule("parameter", "premium")
        
        val resultWithMatch = factory.evaluate(rule, "premium")
        val resultWithoutMatch = factory.evaluate(rule, "basic")
        val resultWithoutParam = factory.evaluate(rule)
        
        assertThat(resultWithMatch).isTrue()
        assertThat(resultWithoutMatch).isFalse()
        assertThat(resultWithoutParam).isFalse()
    }
    
    @Test
    fun `should return false for unknown rule type during evaluation`() {
        val unknownRule = ActivationRule("unknown", "value")
        
        val result = factory.evaluate(unknownRule)
        
        assertThat(result).isFalse()
    }
    
    @Test
    fun `should handle exceptions during rule evaluation`() {
        val faultyStrategy = object : ActivationStrategy {
            override fun evaluate(rule: ActivationRule): Boolean {
                throw RuntimeException("Test exception")
            }
            override fun evaluate(rule: ActivationRule, parameter: String?): Boolean {
                throw RuntimeException("Test exception")
            }
            override fun getRuleType(): String = "faulty"
        }
        
        factory.registerStrategy(faultyStrategy)
        val rule = ActivationRule("faulty", "value")

        val result = factory.evaluate(rule)

        assertThat(result).isFalse()
    }

    // A missing parameter for a match-based rule type (parameter/user_id/country/canary) can
    // only mean the caller forgot to pass one — evaluate() logs an ERROR for this instead of
    // throwing, so a caller mistake degrades to "rule doesn't match" rather than crashing the
    // request. These tests only pin down the non-throwing, false-returning behavior; the log
    // itself isn't asserted (no log-capture harness in this project).
    @Test
    fun `should not throw for a parameter-requiring type given no parameter — degrades to false`() {
        for (type in listOf(
            ActivationRule.TYPE_PARAMETER,
            ActivationRule.TYPE_USER_ID,
            ActivationRule.TYPE_COUNTRY,
            ActivationRule.TYPE_CANARY,
        )) {
            val rule = ActivationRule(type, "some-value")
            assertThat(factory.evaluate(rule)).isFalse()
            assertThat(factory.evaluate(rule, null)).isFalse()
        }
    }

    @Test
    fun `should not log the missing-parameter error for percentage (legitimate random fallback)`() {
        // percentage has a real, intentional meaning for "no parameter" (random draw) — it must
        // not be treated the same as the four match-based types above. This test only checks it
        // still evaluates normally (doesn't throw, returns a valid boolean); there's nothing to
        // assert about logs without a log-capture harness, but the behavioral distinction is the
        // point: 100% must still deterministically return true even with no parameter.
        val rule = ActivationRule(ActivationRule.TYPE_PERCENTAGE, "100")
        assertThat(factory.evaluate(rule)).isTrue()
        assertThat(factory.evaluate(rule, null)).isTrue()
    }

    @Test
    fun `should not require a parameter for time (never uses one)`() {
        val rule = ActivationRule(ActivationRule.TYPE_TIME, "00:00-23:59")
        assertThat(factory.evaluate(rule)).isTrue()
        assertThat(factory.evaluate(rule, null)).isTrue()
    }
}