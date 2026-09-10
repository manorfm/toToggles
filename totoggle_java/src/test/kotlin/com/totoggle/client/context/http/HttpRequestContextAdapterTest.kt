package com.totoggle.client.context.http

import com.totoggle.client.context.CountryResolver
import com.totoggle.client.context.NetworkContextOptions
import com.totoggle.client.context.RequestContextResolver
import com.totoggle.client.context.ToggleRequestContext
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class HttpRequestContextAdapterTest {
    @Test
    fun `binds authenticated and trusted network values for one HTTP request`() {
        val resolver = RequestContextResolver()
        val adapter = adapter(resolver)
        val request = FakeRequest(
            remoteIp = "10.0.0.8",
            headers = mapOf(
                "Forwarded" to "for=203.0.113.8",
                "CF-IPCountry" to "br",
            ),
            userId = "user-42",
        )

        adapter.withRequest(request) {
            assertThat(resolver.resolve("user_id")).isEqualTo("user-42")
            assertThat(resolver.resolve("rollout_key")).isEqualTo("user-42")
            assertThat(resolver.resolve("attributes.plan")).isEqualTo("pro")
            assertThat(resolver.resolve("ip")).isEqualTo("203.0.113.8")
            assertThat(resolver.resolve("country")).isEqualTo("BR")
        }

        assertThat(resolver.resolve("user_id")).isNull()
        assertThat(resolver.resolve("ip")).isNull()
    }

    @Test
    fun `ignores forwarded and country headers from an untrusted peer`() {
        val resolver = RequestContextResolver()
        val adapter = adapter(resolver)
        val request = FakeRequest(
            remoteIp = "198.51.100.8",
            headers = mapOf(
                "X-Forwarded-For" to "203.0.113.8",
                "CF-IPCountry" to "br",
            ),
            userId = "user-42",
        )

        adapter.withRequest(request) {
            assertThat(resolver.resolve("ip")).isEqualTo("198.51.100.8")
            // The untrusted header is ignored; only the local resolver may supply country.
            assertThat(resolver.resolve("country")).isEqualTo("US")
        }
    }

    @Test
    fun `fails closed when application context extraction fails and still cleans the scope`() {
        val resolver = RequestContextResolver()
        val adapter = HttpRequestContextAdapter(
            resolver = resolver,
            metadataExtractor = HttpRequestMetadataExtractor { request ->
                HttpRequestMetadata(request.remoteIp)
            },
            authenticatedContextExtractor = AuthenticatedToggleContextExtractor<FakeRequest> {
                error("authentication backend unavailable")
            },
        )

        adapter.withRequest(FakeRequest(remoteIp = "203.0.113.8")) {
            assertThat(resolver.resolve("user_id")).isNull()
            assertThat(resolver.resolve("rollout_key")).isNull()
            assertThat(resolver.resolve("ip")).isEqualTo("203.0.113.8")
        }
        assertThat(resolver.resolve("ip")).isNull()
    }

    @Test
    fun `fails closed for network rules when HTTP metadata extraction fails`() {
        val resolver = RequestContextResolver()
        val adapter = HttpRequestContextAdapter(
            resolver = resolver,
            metadataExtractor = HttpRequestMetadataExtractor<FakeRequest> {
                error("request adapter unavailable")
            },
            authenticatedContextExtractor = AuthenticatedToggleContextExtractor { request ->
                ToggleRequestContext(userId = request.userId)
            },
        )

        adapter.withRequest(FakeRequest(remoteIp = "203.0.113.8", userId = "user-42")) {
            assertThat(resolver.resolve("user_id")).isEqualTo("user-42")
            assertThat(resolver.resolve("ip")).isNull()
            assertThat(resolver.resolve("country")).isNull()
        }
    }

    @Test
    fun `restores the request scope when the downstream chain throws`() {
        val resolver = RequestContextResolver()
        val adapter = adapter(resolver)

        assertThatThrownBy {
            adapter.withRequest(FakeRequest(remoteIp = "10.0.0.8", userId = "user-42")) {
                error("downstream failure")
            }
        }.isInstanceOf(IllegalStateException::class.java)

        assertThat(resolver.resolve("user_id")).isNull()
        assertThat(resolver.resolve("ip")).isNull()
    }

    private fun adapter(resolver: RequestContextResolver): HttpRequestContextAdapter<FakeRequest> =
        HttpRequestContextAdapter(
            resolver = resolver,
            metadataExtractor = HttpRequestMetadataExtractor { request ->
                HttpRequestMetadata(
                    remoteIp = request.remoteIp,
                    forwarded = request.headers["Forwarded"],
                    forwardedFor = request.headers["X-Forwarded-For"],
                    trustedCountryHeader = request.headers["CF-IPCountry"],
                )
            },
            authenticatedContextExtractor = AuthenticatedToggleContextExtractor { request ->
                request.userId?.let {
                    ToggleRequestContext(
                        userId = it,
                        rolloutKey = it,
                        attributes = mapOf("plan" to "pro"),
                    )
                }
            },
            networkOptions = NetworkContextOptions(
                trustedProxyRanges = listOf("10.0.0.0/8"),
                countryResolver = CountryResolver { "us" },
            ),
        )

    private data class FakeRequest(
        val remoteIp: String?,
        val headers: Map<String, String> = emptyMap(),
        val userId: String? = null,
    )
}
