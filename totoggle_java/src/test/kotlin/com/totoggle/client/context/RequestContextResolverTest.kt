package com.totoggle.client.context

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class RequestContextResolverTest {
    @Test
    fun `resolves canonical domain and network values only inside the request scope`() {
        val resolver = RequestContextResolver()

        assertThat(resolver.resolve("country")).isNull()
        resolver.withContext(
            ToggleRequestContext(
                userId = " user-42 ",
                rolloutKey = " account-9 ",
                cohort = " beta ",
                attributes = mapOf("plan" to " pro ", "blank" to "   "),
            ),
            networkValues = NetworkContext.values(
                NetworkRequest("10.0.0.8", null, "203.0.113.4", "br"),
                NetworkContextOptions(trustedProxyRanges = listOf("10.0.0.8")),
            ),
        ) {
            assertThat(resolver.resolve("user_id")).isEqualTo("user-42")
            assertThat(resolver.resolve("rollout_key")).isEqualTo("account-9")
            assertThat(resolver.resolve("cohort")).isEqualTo("beta")
            assertThat(resolver.resolve("country")).isEqualTo("BR")
            assertThat(resolver.resolve("attributes.plan")).isEqualTo("pro")
            assertThat(resolver.resolve("attributes.blank")).isNull()
            assertThat(resolver.resolve("ip")).isEqualTo("203.0.113.4")
        }
        assertThat(resolver.resolve("country")).isNull()
    }

    @Test
    fun `restores an outer request scope after a nested scope`() {
        val resolver = RequestContextResolver()

        resolver.withContext(ToggleRequestContext(userId = "outer")) {
            resolver.withContext(ToggleRequestContext(userId = "inner")) {
                assertThat(resolver.resolve("user_id")).isEqualTo("inner")
            }
            assertThat(resolver.resolve("user_id")).isEqualTo("outer")
        }
    }

    @Test
    fun `exposes a closeable scope for MVC interceptors without leaking state`() {
        val resolver = RequestContextResolver()

        resolver.openContext(ToggleRequestContext(userId = "interceptor-user")).use {
            assertThat(resolver.resolve("user_id")).isEqualTo("interceptor-user")
        }

        assertThat(resolver.resolve("user_id")).isNull()
    }

    @Test
    fun `cleans the request context when a filter chain throws`() {
        val resolver = RequestContextResolver()

        assertThatThrownBy {
            resolver.withContext(ToggleRequestContext(userId = "failed-request")) {
                error("downstream failure")
            }
        }.isInstanceOf(IllegalStateException::class.java)

        assertThat(resolver.resolve("user_id")).isNull()
    }

    @Test
    fun `accepts only canonical network values and fails closed for malformed data`() {
        val resolver = RequestContextResolver()
        val valid: NetworkContextValues = NetworkContext.values(
            NetworkRequest("10.0.0.8", null, "203.0.113.4", "br"),
            NetworkContextOptions(trustedProxyRanges = listOf("10.0.0.8")),
        )
        val malformed: NetworkContextValues = NetworkContext.values(
            NetworkRequest("not-an-ip", null, null, null),
            NetworkContextOptions(trustedProxyRanges = listOf("10.0.0.8")),
        )
        val invalidCountry: NetworkContextValues = NetworkContext.values(
            NetworkRequest("10.0.0.8", null, null, "Brazil"),
            NetworkContextOptions(trustedProxyRanges = listOf("10.0.0.8")),
        )

        resolver.withContext(ToggleRequestContext(), valid) {
            assertThat(resolver.resolve("ip")).isEqualTo("203.0.113.4")
            assertThat(resolver.resolve("country")).isEqualTo("BR")
        }
        resolver.withContext(ToggleRequestContext(), malformed) {
            assertThat(resolver.resolve("ip")).isNull()
            assertThat(resolver.resolve("country")).isNull()
        }
        resolver.withContext(ToggleRequestContext(), invalidCountry) {
            assertThat(resolver.resolve("ip")).isEqualTo("10.0.0.8")
            assertThat(resolver.resolve("country")).isNull()
        }
    }

    @Test
    fun `isolates concurrent request contexts and clears worker threads`() {
        val resolver = RequestContextResolver()
        val barrier = CyclicBarrier(2)
        val executor = Executors.newFixedThreadPool(2)

        try {
            val results = listOf("first", "second").map { userId ->
                executor.submit<String?> {
                    resolver.withContext(ToggleRequestContext(userId = userId, attributes = mapOf("plan" to userId))) {
                        barrier.await(5, TimeUnit.SECONDS)
                        listOf(resolver.resolve("user_id"), resolver.resolve("attributes.plan")).joinToString(":")
                    }
                }
            }.map { it.get(5, TimeUnit.SECONDS) }

            assertThat(results).containsExactlyInAnyOrder("first:first", "second:second")
            assertThat(executor.submit<String?> { resolver.resolve("user_id") }.get(5, TimeUnit.SECONDS)).isNull()
        } finally {
            executor.shutdownNow()
        }
    }
}
