package com.totoggle.client.strategy

import com.totoggle.client.model.ActivationRule

/**
 * Strategy interface for evaluating activation rules.
 * Each implementation handles a specific type of activation rule.
 */
interface ActivationStrategy {
    
    /**
     * Evaluates the activation rule without a resolved context value.
     * 
     * @param rule The activation rule to evaluate
     * @return true if the rule passes, false otherwise
     */
    fun evaluate(rule: ActivationRule): Boolean
    
    /**
     * Evaluates the activation rule with a value resolved from request context.
     * 
     * @param rule The activation rule to evaluate
     * @param contextValue Optional value resolved from request context for rule evaluation
     * @return true if the rule passes, false otherwise
     */
    fun evaluate(rule: ActivationRule, contextValue: String?): Boolean
    
    /**
     * Returns the rule type this strategy handles.
     */
    fun getRuleType(): String
}
