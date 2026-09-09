package com.totoggle.client.strategy

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.core.read.ListAppender
import com.totoggle.client.model.ActivationRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory

class ContextValueLogSafetyTest {
    @Test
    fun `strategy logs do not disclose rule or request context values`() {
        val sensitiveValues = listOf("configured-user-17", "request-user-99", "203.0.113.77", "rollout-key-42")
        val appenders = listOf(
            capture(UserIdStrategy::class.java) { UserIdStrategy().evaluate(ActivationRule("user_id", "configured-user-17"), "request-user-99") },
            capture(IpStrategy::class.java) { IpStrategy().evaluate(ActivationRule("ip", "203.0.113.77"), "203.0.113.77") },
            capture(PercentageStrategy::class.java) { PercentageStrategy().evaluate(ActivationRule("percentage", "50"), "rollout-key-42") },
            capture(CountryStrategy::class.java) { CountryStrategy().evaluate(ActivationRule("country", "BR"), "BR") },
        )

        val messages = appenders.flatMap { it.list }.map { it.formattedMessage }
        sensitiveValues.forEach { sensitive -> assertThat(messages).noneMatch { it.contains(sensitive) } }
    }

    private fun capture(type: Class<*>, action: () -> Unit): ListAppender<ch.qos.logback.classic.spi.ILoggingEvent> {
        val logger = LoggerFactory.getLogger(type) as Logger
        val previousLevel = logger.level
        return ListAppender<ch.qos.logback.classic.spi.ILoggingEvent>().also { appender ->
            appender.start()
            logger.level = Level.DEBUG
            logger.addAppender(appender)
            try {
                action()
            } finally {
                logger.detachAppender(appender)
                logger.level = previousLevel
            }
        }
    }
}
