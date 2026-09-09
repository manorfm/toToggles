package com.totoggle.client.strategy

import com.totoggle.client.model.ActivationRule
import org.slf4j.LoggerFactory
import java.time.Clock
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

/**
 * Strategy for evaluating time-window activation rules.
 * The rule value is a "HH:mm-HH:mm" 24h window (confirmed hint: "24h time window in server
 * timezone", placeholder "09:00-18:00"). Needs no request context — it compares
 * against the current time on [clock] (see ToToggleConfig#timeZone, threaded in via
 * StrategyFactory). An overnight window (start > end, e.g. "22:00-06:00") wraps past midnight.
 *
 * Takes a [Clock] rather than reading `LocalTime.now()` directly so tests can inject a fixed
 * instant instead of depending on wall-clock time.
 */
class TimeStrategy(private val clock: Clock = Clock.systemDefaultZone()) : ActivationStrategy {

    private val logger = LoggerFactory.getLogger(TimeStrategy::class.java)
    private val formatter = DateTimeFormatter.ofPattern("HH:mm")

    override fun evaluate(rule: ActivationRule): Boolean = evaluate(rule, null)

    override fun evaluate(rule: ActivationRule, contextValue: String?): Boolean {
        val window = rule.value.split("-", limit = 2)
        if (window.size != 2) {
            logger.warn("Time strategy received an invalid window format")
            return false
        }

        return try {
            val start = LocalTime.parse(window[0].trim(), formatter)
            val end = LocalTime.parse(window[1].trim(), formatter)
            val now = LocalTime.now(clock)

            val result = if (start <= end) {
                !now.isBefore(start) && now.isBefore(end)
            } else {
                // Overnight window, e.g. 22:00-06:00
                !now.isBefore(start) || now.isBefore(end)
            }
            logger.debug("Time strategy evaluated: result={}", result)
            result
        } catch (e: DateTimeParseException) {
            logger.warn("Time strategy could not parse its configured window")
            false
        }
    }

    override fun getRuleType(): String = ActivationRule.TYPE_TIME
}
