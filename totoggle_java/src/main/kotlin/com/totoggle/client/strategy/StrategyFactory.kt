package com.totoggle.client.strategy

import com.totoggle.client.exception.StrategyNotFoundException
import com.totoggle.client.model.ActivationRule
import org.slf4j.LoggerFactory
import java.time.Clock
import java.time.ZoneId

/**
 * Factory for creating activation strategy instances based on rule types.
 * This factory implements the Strategy pattern and Factory pattern to
 * handle different types of activation rules.
 *
 * Registers a strategy for all 7 rule types the server supports
 * (server/internal/app/domain/entity/activation_rule.go#GetRuleTypeOptions).
 */
class StrategyFactory(timeZone: ZoneId = ZoneId.systemDefault()) {

    private val logger = LoggerFactory.getLogger(StrategyFactory::class.java)
    private val strategies = mutableMapOf<String, ActivationStrategy>()

    companion object {
        // Match-based rule types cannot pass without a context value. Percentage uses a stable
        // rollout key and time uses the configured clock instead.
        private val TYPES_REQUIRING_CONTEXT = setOf(
            ActivationRule.TYPE_ATTRIBUTE,
            ActivationRule.TYPE_USER_ID,
            ActivationRule.TYPE_IP,
            ActivationRule.TYPE_COUNTRY,
            ActivationRule.TYPE_COHORT,
        )
    }

    init {
        registerStrategy(PercentageStrategy())
        registerStrategy(AttributeStrategy())
        registerStrategy(UserIdStrategy())
        registerStrategy(IpStrategy())
        registerStrategy(CountryStrategy())
        registerStrategy(TimeStrategy(Clock.system(timeZone)))
        registerStrategy(CohortStrategy())

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
     * Never throws for missing resolved context — it degrades to a failed rule. [contextValue]
     * is an internal strategy input supplied by [com.totoggle.client.ToToggleClient] after
     * consulting its configured context resolver; callers use `isActive(path)`.
     *
     * @param rule The activation rule to evaluate
     * @param contextValue Optional value resolved from request context for rule evaluation
     * @return true if the rule passes, false otherwise
     */
    fun evaluate(rule: ActivationRule, contextValue: String? = null): Boolean {
        if (rule.isEmpty()) {
            logger.debug("Empty activation rule, returning true")
            return true
        }

        if (!rule.isValid()) {
            logger.warn("Invalid activation rule; returning false")
            return false
        }

        if (contextValue == null && rule.type in TYPES_REQUIRING_CONTEXT) {
            logger.error(
                "Activation rule requires context but no value was resolved; returning false"
            )
        }

        return try {
            val strategy = getStrategy(rule.type)
            strategy.evaluate(rule, contextValue)
        } catch (_: StrategyNotFoundException) {
            logger.warn("Strategy not found for rule type '{}', returning false", rule.type)
            false
        } catch (_: Exception) {
            logger.error("Activation rule evaluation failed")
            false
        }
    }
}
