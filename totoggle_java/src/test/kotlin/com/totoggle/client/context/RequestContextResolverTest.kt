package com.totoggle.client.context

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class RequestContextResolverTest {
    @Test
    fun `resolves values only inside the request scope and clears them afterwards`() {
        val resolver = RequestContextResolver()

        assertThat(resolver.resolve("country")).isNull()
        resolver.withValues(mapOf("country" to "BR", "attributes.plan" to "pro")) {
            assertThat(resolver.resolve("country")).isEqualTo("BR")
            assertThat(resolver.resolve("attributes.plan")).isEqualTo("pro")
        }
        assertThat(resolver.resolve("country")).isNull()
    }

    @Test
    fun `restores an outer request scope after a nested scope`() {
        val resolver = RequestContextResolver()

        resolver.withValues(mapOf("user_id" to "outer")) {
            resolver.withValues(mapOf("user_id" to "inner")) {
                assertThat(resolver.resolve("user_id")).isEqualTo("inner")
            }
            assertThat(resolver.resolve("user_id")).isEqualTo("outer")
        }
    }
}
