package com.totoggle.client.strategy

import com.totoggle.client.model.ActivationRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class AttributeStrategyTest {
    
    private val strategy = AttributeStrategy()
    
    @Test
    fun `should return correct rule type`() {
        assertThat(strategy.getRuleType()).isEqualTo("attribute")
    }
    
    @Test
    fun `should return false when no context value is resolved`() {
        val rule = ActivationRule("attribute", "premium")
        
        assertThat(strategy.evaluate(rule)).isFalse()
        assertThat(strategy.evaluate(rule, null)).isFalse()
    }
    
    @Test
    fun `should return false when rule value is blank`() {
        val rule = ActivationRule("attribute", "")
        
        assertThat(strategy.evaluate(rule, "premium")).isFalse()
    }
    
    @Test
    fun `should return true when context value matches rule value exactly`() {
        val rule = ActivationRule("attribute", "premium")
        
        assertThat(strategy.evaluate(rule, "premium")).isTrue()
    }
    
    @Test
    fun `should return false when context value does not match rule value`() {
        val rule = ActivationRule("attribute", "premium")
        
        assertThat(strategy.evaluate(rule, "basic")).isFalse()
        assertThat(strategy.evaluate(rule, "Premium")).isFalse() // case sensitive
        assertThat(strategy.evaluate(rule, "PREMIUM")).isFalse() // case sensitive
    }
    
    @Test
    fun `should be case sensitive`() {
        val rule = ActivationRule("attribute", "Premium")
        
        assertThat(strategy.evaluate(rule, "Premium")).isTrue()
        assertThat(strategy.evaluate(rule, "premium")).isFalse()
        assertThat(strategy.evaluate(rule, "PREMIUM")).isFalse()
    }
    
    @Test
    fun `should handle special characters and spaces`() {
        val rule = ActivationRule("attribute", "user-type-1")
        
        assertThat(strategy.evaluate(rule, "user-type-1")).isTrue()
        assertThat(strategy.evaluate(rule, "user type 1")).isFalse()
    }
    
    @Test
    fun `should handle numeric values as strings`() {
        val rule = ActivationRule("attribute", "123")
        
        assertThat(strategy.evaluate(rule, "123")).isTrue()
        assertThat(strategy.evaluate(rule, "124")).isFalse()
    }
    
    @Test
    fun `should handle an empty context value with an empty rule`() {
        val rule = ActivationRule("attribute", "")

        assertThat(strategy.evaluate(rule, "")).isFalse() // blank rule value returns false
    }

    @Test
    fun `should match any value in a comma-separated allowlist`() {
        val rule = ActivationRule("attribute", "premium,enterprise")

        assertThat(strategy.evaluate(rule, "premium")).isTrue()
        assertThat(strategy.evaluate(rule, "enterprise")).isTrue()
        assertThat(strategy.evaluate(rule, "basic")).isFalse()
    }

    @Test
    fun `should trim spaces around comma-separated values`() {
        val rule = ActivationRule("attribute", "premium, enterprise , vip")

        assertThat(strategy.evaluate(rule, "enterprise")).isTrue()
        assertThat(strategy.evaluate(rule, "vip")).isTrue()
    }
}
