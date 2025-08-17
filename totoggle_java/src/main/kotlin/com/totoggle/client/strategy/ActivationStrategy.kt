package com.totoggle.client.strategy

import com.totoggle.client.model.ActivationRule

/**
 * Strategy interface for evaluating activation rules.
 * Each implementation handles a specific type of activation rule.
 */
interface ActivationStrategy {
    
    /**
     * Evaluates the activation rule without parameters.
     * 
     * @param rule The activation rule to evaluate
     * @return true if the rule passes, false otherwise
     */
    fun evaluate(rule: ActivationRule): Boolean
    
    /**
     * Evaluates the activation rule with a parameter.
     * 
     * @param rule The activation rule to evaluate
     * @param parameter Optional parameter for rule evaluation
     * @return true if the rule passes, false otherwise
     */
    fun evaluate(rule: ActivationRule, parameter: String?): Boolean
    
    /**
     * Returns the rule type this strategy handles.
     */
    fun getRuleType(): String
}