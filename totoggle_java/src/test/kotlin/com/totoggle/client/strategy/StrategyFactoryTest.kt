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
    fun `should initialize with default strategies`() {
        val registeredTypes = factory.getRegisteredRuleTypes()
        
        assertThat(registeredTypes).contains("percentage", "parameter")
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
}