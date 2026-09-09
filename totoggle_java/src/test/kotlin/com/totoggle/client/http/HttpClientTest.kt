package com.totoggle.client.http

import com.totoggle.client.config.LogLevel
import com.totoggle.client.config.ToToggleConfig
import com.totoggle.client.exception.AuthenticationException
import com.totoggle.client.exception.NetworkException
import com.totoggle.client.exception.ParseException
import com.totoggle.client.http.ToggleFetchResult.Modified
import com.totoggle.client.http.ToggleFetchResult.NotModified
import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.core.read.ListAppender
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import java.time.Duration

class HttpClientTest {
    
    private lateinit var mockServer: MockWebServer
    private lateinit var config: ToToggleConfig
    private lateinit var httpClient: HttpClient
    
    @BeforeEach
    fun setUp() {
        mockServer = MockWebServer()
        mockServer.start()
        
        config = ToToggleConfig(
            applicationName = "test-app",
            serverUrl = mockServer.url("/").toString().trimEnd('/'),
            secretKey = "sk_test_key",
            connectionTimeout = Duration.ofSeconds(1),
            readTimeout = Duration.ofSeconds(1),
            logLevel = LogLevel.DEBUG
        )
        
        httpClient = HttpClient(config)
    }
    
    @AfterEach
    fun tearDown() {
        httpClient.close()
        mockServer.shutdown()
    }
    
    @Test
    fun `should fetch toggles successfully`() {
        val responseBody = """
            {
                "application": {
                    "id": "app-123",
                    "name": "Test App",
                    "toggles": [
                        {
                            "id": "toggle-1",
                            "path": "user.payments",
                            "value": "payments",
                            "enabled": true,
                            "level": 1,
                            "parent_id": "user-toggle",
                            "app_id": "app-123",
                            "has_activation_rule": false,
                            "activation_rule": null
                        }
                    ]
                }
            }
        """.trimIndent()
        
        mockServer.enqueue(MockResponse()
            .setResponseCode(200)
            .setBody(responseBody)
            .setHeader("Content-Type", "application/json"))
        
        val response = httpClient.fetchToggles() as Modified
        
        assertThat(response.response.application.id).isEqualTo("app-123")
        assertThat(response.response.application.name).isEqualTo("Test App")
        assertThat(response.response.application.toggles).hasSize(1)
        assertThat(response.response.application.toggles[0].path).isEqualTo("user.payments")
        
        val request = mockServer.takeRequest()
        assertThat(request.path).isEqualTo("/api/toggles")
        assertThat(request.getHeader("X-API-Key")).isEqualTo("sk_test_key")
        assertThat(request.getHeader("User-Agent")).contains("ToToggle-Java-Client/1.0.0")
        assertThat(request.getHeader("User-Agent")).contains("test-app")
    }

    @Test
    fun `should retain the quoted ETag and catalogue revision returned by a 200 response`() {
        mockServer.enqueue(MockResponse()
            .setResponseCode(200)
            .setHeader("ETag", "\"catalog-v7\"")
            .setBody("""{"application":{"id":"app-123","name":"Test App","revision":"revision-7","toggles":[]}}"""))

        val result = httpClient.fetchToggles()

        assertThat(result).isInstanceOf(Modified::class.java)
        val modified = result as Modified
        assertThat(modified.etag).isEqualTo("\"catalog-v7\"")
        assertThat(modified.response.application.revision).isEqualTo("revision-7")
    }

    @Test
    fun `should send a prior ETag and treat an empty 304 response as successful revalidation`() {
        mockServer.enqueue(MockResponse()
            .setResponseCode(304)
            .setHeader("ETag", "\"catalog-v7\""))

        val result = httpClient.fetchToggles("\"catalog-v7\"")

        assertThat(result).isInstanceOf(NotModified::class.java)
        assertThat((result as NotModified).etag).isEqualTo("\"catalog-v7\"")
        assertThat(mockServer.takeRequest().getHeader("If-None-Match")).isEqualTo("\"catalog-v7\"")
    }

    @Test
    fun `should accept a 200 response without a catalogue validator`() {
        mockServer.enqueue(MockResponse()
            .setResponseCode(200)
            .setBody("""{"application":{"id":"app-123","name":"Test App","revision":"revision-7","toggles":[]}}"""))

        val result = httpClient.fetchToggles() as Modified
        assertThat(result.etag).isNull()
    }
    
    @Test
    fun `should handle authentication error`() {
        mockServer.enqueue(MockResponse().setResponseCode(401))
        
        assertThatThrownBy { httpClient.fetchToggles() }
            .isInstanceOf(AuthenticationException::class.java)
            .hasMessageContaining("Invalid secret key")
    }
    
    @Test
    fun `should parse multiple toggles where activation_rule is null for every one without a rule`() {
        // The real GET /api/toggles handler (server/internal/app/handler/secret_key_handler.go)
        // serializes a nil *ActivationRule as JSON null whenever has_activation_rule is false —
        // confirmed in docs/rest-flow.md's documented example response. Toggle.activationRule
        // used to be non-nullable, which made every toggle without a rule (the common case) fail
        // to parse via Jackson's kotlin-module (MissingKotlinParameterException).
        val responseBody = """
            {
                "application": {
                    "id": "app-123",
                    "name": "Test App",
                    "toggles": [
                        {
                            "id": "toggle-1",
                            "path": "user",
                            "value": "user",
                            "enabled": true,
                            "level": 0,
                            "parent_id": null,
                            "app_id": "app-123",
                            "has_activation_rule": false,
                            "activation_rule": null
                        },
                        {
                            "id": "toggle-2",
                            "path": "user.payments",
                            "value": "payments",
                            "enabled": true,
                            "level": 1,
                            "parent_id": "toggle-1",
                            "app_id": "app-123",
                            "has_activation_rule": true,
                            "activation_rule": {"type": "percentage", "value": "50"}
                        }
                    ]
                }
            }
        """.trimIndent()

        mockServer.enqueue(MockResponse()
            .setResponseCode(200)
            .setBody(responseBody)
            .setHeader("Content-Type", "application/json"))

        val response = httpClient.fetchToggles() as Modified

        assertThat(response.response.application.toggles).hasSize(2)
        assertThat(response.response.application.toggles[0].activationRule).isNull()
        assertThat(response.response.application.toggles[1].activationRule?.type).isEqualTo("percentage")
    }

    @Test
    fun `should handle not found error`() {
        mockServer.enqueue(MockResponse().setResponseCode(404))
        
        assertThatThrownBy { httpClient.fetchToggles() }
            .isInstanceOf(NetworkException::class.java)
            .hasMessageContaining("API endpoint not found")
    }
    
    @Test
    fun `should handle server error`() {
        mockServer.enqueue(MockResponse().setResponseCode(500))
        
        assertThatThrownBy { httpClient.fetchToggles() }
            .isInstanceOf(NetworkException::class.java)
            .hasMessageContaining("Server error: 500")
    }
    
    @Test
    fun `should handle unexpected response code`() {
        mockServer.enqueue(MockResponse().setResponseCode(418)) // I'm a teapot
        
        assertThatThrownBy { httpClient.fetchToggles() }
            .isInstanceOf(NetworkException::class.java)
            .hasMessageContaining("Unexpected response code: 418")
    }
    
    @Test
    fun `should handle empty response body`() {
        mockServer.enqueue(MockResponse()
            .setResponseCode(200)
            .setBody(""))
        
        assertThatThrownBy { httpClient.fetchToggles() }
            .isInstanceOf(ParseException::class.java)
            .hasMessageContaining("Empty response body")
    }
    
    @Test
    fun `should handle invalid JSON response`() {
        mockServer.enqueue(MockResponse()
            .setResponseCode(200)
            .setBody("invalid json"))
        
        assertThatThrownBy { httpClient.fetchToggles() }
            .isInstanceOf(ParseException::class.java)
            .hasMessageContaining("Failed to parse server response")
    }
    
    @Test
    fun `should handle network timeout`() {
        // Set a response with delay longer than the configured timeout
        mockServer.enqueue(MockResponse()
            .setResponseCode(200)
            .setBody("{}")
            .setBodyDelay(2, java.util.concurrent.TimeUnit.SECONDS)) // Delay longer than timeout
        
        assertThatThrownBy { httpClient.fetchToggles() }
            .isInstanceOf(NetworkException::class.java)
            .hasMessageContaining("Failed to fetch toggles from server")
    }
    
    @Test
    fun `should handle malformed response structure`() {
        val invalidResponseBody = """
            {
                "not_application": {
                    "id": "app-123"
                }
            }
        """.trimIndent()
        
        mockServer.enqueue(MockResponse()
            .setResponseCode(200)
            .setBody(invalidResponseBody)
            .setHeader("Content-Type", "application/json"))
        
        assertThatThrownBy { httpClient.fetchToggles() }
            .isInstanceOf(ParseException::class.java)
            .hasMessageContaining("Failed to parse server response")
    }

    @Test
    fun `should never log API keys headers or raw response bodies at trace`() {
        val apiKey = "sk_sensitive_api-key"
        val responseMarker = "response-body-secret"
        val traceClient = HttpClient(config.copy(secretKey = apiKey, logLevel = LogLevel.TRACE))
        val logger = LoggerFactory.getLogger(HttpClient::class.java) as Logger
        val appender = ListAppender<ch.qos.logback.classic.spi.ILoggingEvent>()
        val previousLevel = logger.level

        mockServer.enqueue(MockResponse().setResponseCode(200).setBody("""
            {"application":{"id":"app-123","name":"$responseMarker","toggles":[]}}
        """.trimIndent()))

        try {
            appender.start()
            logger.level = Level.DEBUG
            logger.addAppender(appender)

            traceClient.fetchToggles()

            val messages = appender.list.map { it.formattedMessage }
            assertThat(messages).noneMatch { it.contains(apiKey) }
            assertThat(messages).noneMatch { it.contains("X-API-Key") }
            assertThat(messages).noneMatch { it.contains(responseMarker) }
        } finally {
            logger.detachAppender(appender)
            logger.level = previousLevel
            traceClient.close()
        }
    }
}
