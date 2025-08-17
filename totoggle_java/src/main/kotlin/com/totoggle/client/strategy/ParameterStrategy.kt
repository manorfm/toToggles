package com.totoggle.client.strategy

import com.totoggle.client.model.ActivationRule
import org.slf4j.LoggerFactory

/**
 * Strategy for evaluating parameter-based activation rules.
 * This strategy activates toggles when the provided parameter matches the configured value.
 * 
 * For example, if the rule value is "premium" and the parameter passed is "premium", 
 * then the evaluation returns true.
 */
class ParameterStrategy : ActivationStrategy {
    
    private val logger = LoggerFactory.getLogger(ParameterStrategy::class.java)
    
    override fun evaluate(rule: ActivationRule): Boolean {
        // Parameter strategy requires a parameter to compare against
        logger.debug("Parameter strategy called without parameter, returning false")
        return false
    }
    
    override fun evaluate(rule: ActivationRule, parameter: String?): Boolean {
        return try {
            if (parameter == null) {
                logger.debug("Parameter strategy: no parameter provided, returning false")
                return false
            }
            
            if (rule.value.isBlank()) {
                logger.warn("Parameter strategy: rule value is blank")
                return false
            }
            
            val result = rule.value.equals(parameter, ignoreCase = false)
            logger.debug("Parameter strategy: rule='${rule.value}', parameter='$parameter', result=$result")
            result
            
        } catch (e: Exception) {
            logger.error("Error evaluating parameter rule: ${rule.value} with parameter: $parameter", e)
            false
        }
    }
    
    override fun getRuleType(): String = ActivationRule.TYPE_PARAMETER
}