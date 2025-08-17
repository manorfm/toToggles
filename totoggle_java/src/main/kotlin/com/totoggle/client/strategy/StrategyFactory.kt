package com.totoggle.client.strategy

import com.totoggle.client.exception.StrategyNotFoundException
import com.totoggle.client.model.ActivationRule
import org.slf4j.LoggerFactory

/**
 * Factory for creating activation strategy instances based on rule types.
 * This factory implements the Strategy pattern and Factory pattern to 
 * handle different types of activation rules.
 */
class StrategyFactory {
    
    private val logger = LoggerFactory.getLogger(StrategyFactory::class.java)
    private val strategies = mutableMapOf<String, ActivationStrategy>()
    
    init {
        // Register default strategies
        registerStrategy(PercentageStrategy())
        registerStrategy(ParameterStrategy())
        
        logger.info("StrategyFactory initialized with {} strategies", strategies.size)
    }
    
    /**
     * Registers an activation strategy.
     * 
     * @param strategy The strategy to register
     */
    fun registerStrategy(strategy: ActivationStrategy) {
        strategies[strategy.getRuleType()] = strategy
        logger.debug("Registered strategy for rule type: {}", strategy.getRuleType())
    }
    
    /**
     * Gets a strategy for the given rule type.
     * 
     * @param ruleType The rule type
     * @return The activation strategy
     * @throws StrategyNotFoundException if no strategy is found for the rule type
     */
    fun getStrategy(ruleType: String): ActivationStrategy {
        return strategies[ruleType] 
            ?: throw StrategyNotFoundException(ruleType)
    }
    
    /**
     * Checks if a strategy is available for the given rule type.
     * 
     * @param ruleType The rule type
     * @return true if a strategy is available, false otherwise
     */
    fun hasStrategy(ruleType: String): Boolean {
        return strategies.containsKey(ruleType)
    }
    
    /**
     * Gets all registered rule types.
     * 
     * @return Set of registered rule types
     */
    fun getRegisteredRuleTypes(): Set<String> {
        return strategies.keys.toSet()
    }
    
    /**
     * Evaluates an activation rule using the appropriate strategy.
     * 
     * @param rule The activation rule to evaluate
     * @param parameter Optional parameter for rule evaluation
     * @return true if the rule passes, false otherwise
     */
    fun evaluate(rule: ActivationRule, parameter: String? = null): Boolean {
        if (rule.isEmpty()) {
            logger.debug("Empty activation rule, returning true")
            return true
        }
        
        if (!rule.isValid()) {
            logger.warn("Invalid activation rule: type='${rule.type}', value='${rule.value}'")
            return false
        }
        
        return try {
            val strategy = getStrategy(rule.type)
            strategy.evaluate(rule, parameter)
        } catch (e: StrategyNotFoundException) {
            logger.warn("Strategy not found for rule type '{}', returning false", rule.type)
            false
        } catch (e: Exception) {
            logger.error("Error evaluating activation rule: type='${rule.type}', value='${rule.value}'", e)
            false
        }
    }
}