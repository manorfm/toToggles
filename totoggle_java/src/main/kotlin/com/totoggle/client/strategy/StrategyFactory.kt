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
 * (server/internal/app/domain/entity/activation_rule.go#GetRuleTypeOptions) — a previous
 * version only registered percentage/parameter, silently failing closed (always `false`) for
 * user_id/ip/country/time/canary.
 */
class StrategyFactory(timeZone: ZoneId = ZoneId.systemDefault()) {

    private val logger = LoggerFactory.getLogger(StrategyFactory::class.java)
    private val strategies = mutableMapOf<String, ActivationStrategy>()

    companion object {
        // Rule types whose evaluation is a match against a caller-supplied value (see
        // strategy/CommaListMatch.kt) — these can NEVER pass with no parameter, unlike
        // "percentage" (a null parameter is a legitimate fallback to a random draw) or "time"
        // (doesn't use a parameter at all). A null parameter here is never a valid, deliberate
        // choice — it can only mean the caller forgot to pass one, whether the rule lives on the
        // toggle being asked about or on one of its ancestors in the path.
        private val TYPES_REQUIRING_PARAMETER = setOf(
            ActivationRule.TYPE_PARAMETER,
            ActivationRule.TYPE_USER_ID,
            ActivationRule.TYPE_COUNTRY,
            ActivationRule.TYPE_CANARY,
        )
    }

    init {
        registerStrategy(PercentageStrategy())
        registerStrategy(ParameterStrategy())
        registerStrategy(UserIdStrategy())
        registerStrategy(IpStrategy())
        registerStrategy(CountryStrategy())
        registerStrategy(TimeStrategy(Clock.system(timeZone)))
        registerStrategy(CanaryStrategy())

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
     * Never throws for a missing parameter — a caller-side mistake here should degrade to "rule
     * doesn't match" (`false`), not crash the caller's request. Instead, when [rule]'s type is
     * one of [TYPES_REQUIRING_PARAMETER] and [parameter] is null, this logs an ERROR: that
     * combination can only mean the code calling `isActive()` forgot to pass a parameter that a
     * rule on the toggle (or one of its ancestors — see ToToggleClient#areParentsActive) actually
     * needs. This can't be caught at compile time: the rule catalog is fetched from the server at
     * runtime and can change independently of the calling code, so there's no static type that
     * could encode "this path string needs a parameter."
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

        if (parameter == null && rule.type in TYPES_REQUIRING_PARAMETER) {
            logger.error(
                "Activation rule type '{}' (value='{}') requires a parameter to evaluate, but " +
                    "isActive() was called without one. This toggle — or an ancestor of the " +
                    "toggle being checked — will always evaluate to false until a parameter is " +
                    "passed to isActive(path, parameter).",
                rule.type, rule.value
            )
        }

        return try {
            val strategy = getStrategy(rule.type)
            strategy.evaluate(rule, parameter)
        } catch (_: StrategyNotFoundException) {
            logger.warn("Strategy not found for rule type '{}', returning false", rule.type)
            false
        } catch (e: Exception) {
            logger.error("Error evaluating activation rule: type='${rule.type}', value='${rule.value}'", e)
            false
        }
    }
}