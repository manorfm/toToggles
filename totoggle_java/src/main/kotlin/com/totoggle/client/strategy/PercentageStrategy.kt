package com.totoggle.client.strategy

import com.totoggle.client.model.ActivationRule
import org.slf4j.LoggerFactory
import kotlin.random.Random
import java.nio.charset.StandardCharsets

/**
 * Strategy for evaluating percentage-based activation rules.
 * This strategy activates toggles based on a configured percentage of requests.
 *
 * The confirmed rule hint promises "Consistent hashing — same user always gets the same
 * result." When a stable rollout context value (typically a user/session ID) is provided, this bucket is
 * deterministic: the same context value + rule value always evaluates the same way, using Java's
 * specified (stable across JVMs/runs) `String.hashCode()` algorithm rather than a fresh random
 * draw. The bucket is keyed on `rule.value + context value` rather than the toggle's own path/ID
 * (which this strategy never receives), so two DIFFERENT toggles that happen to share the exact
 * same threshold will correlate for a given key — configure a sufficiently unique context value (e.g.
 * combining a user ID with the toggle path) if independence across same-percentage toggles
 * matters for a given use case.
 *
 * The client requires `ToggleContext.rolloutKey` before this strategy is reached, so a missing
 * identity fails closed instead of using a random per-call cohort.
 */
class PercentageStrategy : ActivationStrategy {

    private val logger = LoggerFactory.getLogger(PercentageStrategy::class.java)
    private val random = Random.Default

    override fun evaluate(rule: ActivationRule): Boolean {
        return evaluate(rule, null)
    }

    override fun evaluate(rule: ActivationRule, contextValue: String?): Boolean {
        return try {
            val percentage = rule.value.toDoubleOrNull()
            if (percentage == null) {
                logger.warn("Invalid percentage rule value")
                return false
            }

            if (percentage !in 0.0..100.0) {
                logger.warn("Percentage rule value is outside the supported range")
                return false
            }

            val bucket = if (contextValue != null) {
                consistentBucket(rule.value, contextValue)
            } else {
                random.nextDouble(0.0, 100.0)
            }
            val result = bucket < percentage

            logger.debug("Percentage strategy evaluated: result={}", result)
            result

        } catch (_: Exception) {
            logger.error("Percentage strategy evaluation failed")
            false
        }
    }

    /** Deterministic bucket in [0, 100) derived from a stable key, using the JLS-specified
     * (portable across SDKs and runs) FNV-1a over UTF-8 bytes. */
    private fun consistentBucket(ruleValue: String, key: String): Double {
        var hash = 0x811c9dc5L
        for (byte in "$ruleValue:$key".toByteArray(StandardCharsets.UTF_8)) {
            hash = (hash xor (byte.toLong() and 0xffL)) * 0x01000193L and 0xffffffffL
        }
        return hash % 10000L / 100.0
    }

    override fun getRuleType(): String = ActivationRule.TYPE_PERCENTAGE
}
