package com.totoggle.client.strategy

import com.totoggle.client.model.ActivationRule
import org.slf4j.LoggerFactory
import kotlin.random.Random

/**
 * Strategy for evaluating percentage-based activation rules.
 * This strategy activates toggles based on a configured percentage of requests.
 * 
 * For example, if the rule value is "25", then approximately 25% of calls will return true.
 */
class PercentageStrategy : ActivationStrategy {
    
    private val logger = LoggerFactory.getLogger(PercentageStrategy::class.java)
    private val random = Random.Default
    
    override fun evaluate(rule: ActivationRule): Boolean {
        return evaluate(rule, null)
    }
    
    override fun evaluate(rule: ActivationRule, parameter: String?): Boolean {
        return try {
            val percentage = rule.value.toDoubleOrNull()
            if (percentage == null) {
                logger.warn("Invalid percentage value: ${rule.value}")
                return false
            }
            
            if (percentage < 0 || percentage > 100) {
                logger.warn("Percentage value out of range [0,100]: $percentage")
                return false
            }
            
            val randomValue = random.nextDouble(0.0, 100.0)
            val result = randomValue < percentage
            
            logger.debug("Percentage strategy: random=$randomValue, threshold=$percentage, result=$result")
            result
            
        } catch (e: Exception) {
            logger.error("Error evaluating percentage rule: ${rule.value}", e)
            false
        }
    }
    
    override fun getRuleType(): String = ActivationRule.TYPE_PERCENTAGE
}