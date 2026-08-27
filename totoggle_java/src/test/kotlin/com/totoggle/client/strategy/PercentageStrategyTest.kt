package com.totoggle.client.strategy

import com.totoggle.client.model.ActivationRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.RepeatedTest

class PercentageStrategyTest {
    
    private val strategy = PercentageStrategy()
    
    @Test
    fun `should return correct rule type`() {
        assertThat(strategy.getRuleType()).isEqualTo("percentage")
    }
    
    @Test
    fun `should return false for invalid percentage values`() {
        val invalidRules = listOf(
            ActivationRule("percentage", "invalid"),
            ActivationRule("percentage", ""),
            ActivationRule("percentage", "-10"),
            ActivationRule("percentage", "150"),
            ActivationRule("percentage", "abc")
        )
        
        invalidRules.forEach { rule ->
            assertThat(strategy.evaluate(rule)).isFalse()
            assertThat(strategy.evaluate(rule, "param")).isFalse()
        }
    }
    
    @Test
    fun `should return false for 0 percent`() {
        val rule = ActivationRule("percentage", "0")
        
        // Test multiple times to ensure consistency
        repeat(10) {
            assertThat(strategy.evaluate(rule)).isFalse()
        }
    }
    
    @Test
    fun `should return true for 100 percent`() {
        val rule = ActivationRule("percentage", "100")
        
        // Test multiple times to ensure consistency
        repeat(10) {
            assertThat(strategy.evaluate(rule)).isTrue()
        }
    }
    
    @RepeatedTest(50)
    fun `should respect percentage distribution approximately`() {
        val rule = ActivationRule("percentage", "25")
        var trueCount = 0
        val iterations = 1000
        
        repeat(iterations) {
            if (strategy.evaluate(rule)) {
                trueCount++
            }
        }
        
        val actualPercentage = (trueCount.toDouble() / iterations) * 100
        
        // Allow some variance in random distribution (±10%)
        assertThat(actualPercentage).isBetween(15.0, 35.0)
    }
    
    @Test
    fun `should handle decimal percentages`() {
        val rule = ActivationRule("percentage", "25.5")
        
        // Should not throw exception
        val result = strategy.evaluate(rule)
        // Result should be a valid boolean (true or false)
        assertThat(result).isIn(true, false)
    }
    
    @Test
    fun `should return a valid boolean whether or not a parameter is given`() {
        val rule = ActivationRule("percentage", "50")

        val result1 = strategy.evaluate(rule, "some-param")
        val result2 = strategy.evaluate(rule, null)

        assertThat(result1).isIn(true, false)
        assertThat(result2).isIn(true, false)
    }

    @Test
    fun `should return the same result for the same parameter every time (consistent hashing)`() {
        val rule = ActivationRule("percentage", "50")

        val results = (1..20).map { strategy.evaluate(rule, "user-42") }

        assertThat(results.toSet()).hasSize(1)
    }

    @Test
    fun `should return different results for different parameters, statistically matching the threshold`() {
        val rule = ActivationRule("percentage", "25")

        val trueCount = (1..1000).count { strategy.evaluate(rule, "user-$it") }
        val actualPercentage = (trueCount.toDouble() / 1000) * 100

        // Same tolerance as the random-distribution test above (±10%)
        assertThat(actualPercentage).isBetween(15.0, 35.0)
    }

    @Test
    fun `should still vary across repeated calls when there is no parameter to key on`() {
        val rule = ActivationRule("percentage", "50")

        val results = (1..30).map { strategy.evaluate(rule, null) }.toSet()

        assertThat(results).hasSize(2)
    }
}