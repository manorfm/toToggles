package com.totoggle.client.strategy

import com.totoggle.client.model.ActivationRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class ParameterStrategyTest {
    
    private val strategy = ParameterStrategy()
    
    @Test
    fun `should return correct rule type`() {
        assertThat(strategy.getRuleType()).isEqualTo("parameter")
    }
    
    @Test
    fun `should return false when no parameter provided`() {
        val rule = ActivationRule("parameter", "premium")
        
        assertThat(strategy.evaluate(rule)).isFalse()
        assertThat(strategy.evaluate(rule, null)).isFalse()
    }
    
    @Test
    fun `should return false when rule value is blank`() {
        val rule = ActivationRule("parameter", "")
        
        assertThat(strategy.evaluate(rule, "premium")).isFalse()
    }
    
    @Test
    fun `should return true when parameter matches rule value exactly`() {
        val rule = ActivationRule("parameter", "premium")
        
        assertThat(strategy.evaluate(rule, "premium")).isTrue()
    }
    
    @Test
    fun `should return false when parameter does not match rule value`() {
        val rule = ActivationRule("parameter", "premium")
        
        assertThat(strategy.evaluate(rule, "basic")).isFalse()
        assertThat(strategy.evaluate(rule, "Premium")).isFalse() // case sensitive
        assertThat(strategy.evaluate(rule, "PREMIUM")).isFalse() // case sensitive
    }
    
    @Test
    fun `should be case sensitive`() {
        val rule = ActivationRule("parameter", "Premium")
        
        assertThat(strategy.evaluate(rule, "Premium")).isTrue()
        assertThat(strategy.evaluate(rule, "premium")).isFalse()
        assertThat(strategy.evaluate(rule, "PREMIUM")).isFalse()
    }
    
    @Test
    fun `should handle special characters and spaces`() {
        val rule = ActivationRule("parameter", "user-type-1")
        
        assertThat(strategy.evaluate(rule, "user-type-1")).isTrue()
        assertThat(strategy.evaluate(rule, "user type 1")).isFalse()
    }
    
    @Test
    fun `should handle numeric values as strings`() {
        val rule = ActivationRule("parameter", "123")
        
        assertThat(strategy.evaluate(rule, "123")).isTrue()
        assertThat(strategy.evaluate(rule, "124")).isFalse()
    }
    
    @Test
    fun `should handle empty parameter vs empty rule`() {
        val rule = ActivationRule("parameter", "")
        
        assertThat(strategy.evaluate(rule, "")).isFalse() // blank rule value returns false
    }
}