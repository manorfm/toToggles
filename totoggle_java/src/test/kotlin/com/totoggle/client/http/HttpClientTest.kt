package com.totoggle.client.http

import com.totoggle.client.config.LogLevel
import com.totoggle.client.config.ToToggleConfig
import com.totoggle.client.exception.AuthenticationException
import com.totoggle.client.exception.NetworkException
import com.totoggle.client.exception.ParseException
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
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
                            "activation_rule": {
                                "type": "",
                                "value": ""
                            }
                        }
                    ]
                }
            }
        """.trimIndent()
        
        mockServer.enqueue(MockResponse()
            .setResponseCode(200)
            .setBody(responseBody)
            .setHeader("Content-Type", "application/json"))
        
        val response = httpClient.fetchToggles()
        
        assertThat(response.application.id).isEqualTo("app-123")
        assertThat(response.application.name).isEqualTo("Test App")
        assertThat(response.application.toggles).hasSize(1)
        assertThat(response.application.toggles[0].path).isEqualTo("user.payments")
        
        val request = mockServer.takeRequest()
        assertThat(request.path).isEqualTo("/api/toggles")
        assertThat(request.getHeader("X-API-Key")).isEqualTo("sk_test_key")
        assertThat(request.getHeader("User-Agent")).contains("ToToggle-Java-Client/1.0.0")
        assertThat(request.getHeader("User-Agent")).contains("test-app")
    }
    
    @Test
    fun `should handle authentication error`() {
        mockServer.enqueue(MockResponse().setResponseCode(401))
        
        assertThatThrownBy { httpClient.fetchToggles() }
            .isInstanceOf(AuthenticationException::class.java)
            .hasMessageContaining("Invalid secret key")
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
}