package com.totoggle.client.strategy

import com.totoggle.client.model.ActivationRule
import org.slf4j.LoggerFactory
import kotlin.random.Random

/**
 * Strategy for evaluating percentage-based activation rules.
 * This strategy activates toggles based on a configured percentage of requests.
 *
 * The confirmed rule hint promises "Consistent hashing — same user always gets the same
 * result." When a `parameter` (typically a stable user/session ID) is provided, this bucket is
 * deterministic: the same `parameter` + rule value always evaluates the same way, using Java's
 * specified (stable across JVMs/runs) `String.hashCode()` algorithm rather than a fresh random
 * draw. The bucket is keyed on `rule.value + parameter` rather than the toggle's own path/ID
 * (which this strategy never receives), so two DIFFERENT toggles that happen to share the exact
 * same threshold will correlate for a given key — pass a sufficiently unique parameter (e.g.
 * combining a user ID with the toggle path) if independence across same-percentage toggles
 * matters for a given use case.
 *
 * With no `parameter` (the caller has no stable identity to key on), this falls back to the
 * original per-call random draw — the same behavior as before, since there is nothing to be
 * consistent with.
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

            if (percentage !in 0.0..100.0) {
                logger.warn("Percentage value out of range [0,100]: $percentage")
                return false
            }

            val bucket = if (parameter != null) {
                consistentBucket(rule.value, parameter)
            } else {
                random.nextDouble(0.0, 100.0)
            }
            val result = bucket < percentage

            logger.debug("Percentage strategy: bucket=$bucket, threshold=$percentage, parameter=$parameter, result=$result")
            result

        } catch (e: Exception) {
            logger.error("Error evaluating percentage rule: ${rule.value}", e)
            false
        }
    }

    /** Deterministic bucket in [0, 100) derived from a stable key, using the JLS-specified
     * (portable across JVMs and runs) `String.hashCode()` algorithm. */
    private fun consistentBucket(ruleValue: String, key: String): Double {
        val hash = "$ruleValue:$key".hashCode()
        return (hash.toLong() and 0xFFFFFFFFL) % 10000L / 100.0
    }

    override fun getRuleType(): String = ActivationRule.TYPE_PERCENTAGE
}