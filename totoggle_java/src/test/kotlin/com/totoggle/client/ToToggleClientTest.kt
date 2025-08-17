package com.totoggle.client

import com.totoggle.client.config.LogLevel
import com.totoggle.client.config.ToToggleConfig
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.Duration

class ToToggleClientTest {
    
    private lateinit var mockServer: MockWebServer
    private lateinit var config: ToToggleConfig
    private lateinit var client: ToToggleClient
    
    @BeforeEach
    fun setUp() {
        mockServer = MockWebServer()
        mockServer.start()
        
        config = ToToggleConfig(
            applicationName = "test-app",
            serverUrl = mockServer.url("/").toString().trimEnd('/'),
            secretKey = "sk_test_key",
            refreshInterval = Duration.ofMinutes(1),
            connectionTimeout = Duration.ofSeconds(1),
            readTimeout = Duration.ofSeconds(1),
            logLevel = LogLevel.DEBUG
        )
        
        client = ToToggleClient(config)
    }
    
    @AfterEach
    fun tearDown() {
        if (client.isHealthy()) {
            client.shutdown()
        }
        mockServer.shutdown()
    }
    
    @Test
    fun `should start client and fetch initial data`() {
        mockSuccessfulResponse()
        
        client.start()
        
        assertThat(client.isHealthy()).isTrue()
        assertThat(client.getCacheInfo()).contains("3 toggles")
    }
    
    @Test
    fun `should return false for non-existent toggle`() {
        mockSuccessfulResponse()
        client.start()
        
        val result = client.isActive("nonexistent.toggle")
        
        assertThat(result).isFalse()
    }
    
    @Test
    fun `should return true for enabled toggle without rules`() {
        mockSuccessfulResponse()
        client.start()
        
        val result = client.isActive("user")
        
        assertThat(result).isTrue()
    }
    
    @Test
    fun `should return false for disabled toggle`() {
        mockResponseWithDisabledToggle()
        client.start()
        
        val result = client.isActive("user.payments")
        
        assertThat(result).isFalse()
    }
    
    @Test
    fun `should validate parent toggles in cascade`() {
        mockResponseWithDisabledParent()
        client.start()
        
        // Child toggle is enabled but parent is disabled
        val result = client.isActive("user.payments.view-table")
        
        assertThat(result).isFalse()
    }
    
    @Test
    fun `should evaluate percentage activation rules`() {
        mockResponseWithPercentageRule()
        client.start()
        
        // Test multiple times to see both true and false results
        val results = (1..100).map { client.isActive("user.payments.view-table") }
        
        // Should have some true and some false results (statistical test)
        assertThat(results).contains(true)
        assertThat(results).contains(false)
    }
    
    @Test
    fun `should evaluate parameter activation rules`() {
        mockResponseWithParameterRule()
        client.start()
        
        val resultWithMatch = client.isActive("user.payments.view-table", "premium")
        val resultWithoutMatch = client.isActive("user.payments.view-table", "basic")
        val resultWithoutParam = client.isActive("user.payments.view-table")
        
        assertThat(resultWithMatch).isTrue()
        assertThat(resultWithoutMatch).isFalse()
        assertThat(resultWithoutParam).isFalse()
    }
    
    @Test
    fun `should handle network errors gracefully when offline mode enabled`() {
        mockSuccessfulResponse()
        client.start()
        
        // Verify initial data is loaded
        assertThat(client.isActive("user")).isTrue()
        
        // Simulate network error for next refresh
        mockServer.enqueue(MockResponse().setResponseCode(500))
        client.refresh()
        
        // Should still work with cached data
        assertThat(client.isActive("user")).isTrue()
        assertThat(client.getLastError()).isNotNull()
    }
    
    @Test
    fun `should not allow operations before start`() {
        assertThatThrownBy { client.isActive("user") }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("Client must be started")
        
        assertThatThrownBy { client.refresh() }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("Client must be started")
    }
    
    @Test
    fun `should not allow restart after shutdown`() {
        mockSuccessfulResponse()
        client.start()
        client.shutdown()
        
        assertThatThrownBy { client.start() }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("Client has been shut down")
    }
    
    @Test
    fun `should not allow double start`() {
        mockSuccessfulResponse()
        client.start()
        
        // Second start should not throw but should warn (log message)
        client.start() // Should not throw
        
        assertThat(client.isHealthy()).isTrue()
    }
    
    @Test
    fun `should shutdown gracefully`() {
        mockSuccessfulResponse()
        client.start()
        
        assertThat(client.isHealthy()).isTrue()
        
        client.shutdown()
        
        assertThat(client.isHealthy()).isFalse()
    }
    
    private fun mockSuccessfulResponse() {
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
                            "activation_rule": {"type": "", "value": ""}
                        },
                        {
                            "id": "toggle-2",
                            "path": "user.payments",
                            "value": "payments",
                            "enabled": true,
                            "level": 1,
                            "parent_id": "toggle-1",
                            "app_id": "app-123",
                            "has_activation_rule": false,
                            "activation_rule": {"type": "", "value": ""}
                        },
                        {
                            "id": "toggle-3",
                            "path": "user.payments.view-table",
                            "value": "view-table",
                            "enabled": true,
                            "level": 2,
                            "parent_id": "toggle-2",
                            "app_id": "app-123",
                            "has_activation_rule": false,
                            "activation_rule": {"type": "", "value": ""}
                        }
                    ]
                }
            }
        """.trimIndent()
        
        mockServer.enqueue(MockResponse()
            .setResponseCode(200)
            .setBody(responseBody)
            .setHeader("Content-Type", "application/json"))
    }
    
    private fun mockResponseWithDisabledToggle() {
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
                            "activation_rule": {"type": "", "value": ""}
                        },
                        {
                            "id": "toggle-2",
                            "path": "user.payments",
                            "value": "payments",
                            "enabled": false,
                            "level": 1,
                            "parent_id": "toggle-1",
                            "app_id": "app-123",
                            "has_activation_rule": false,
                            "activation_rule": {"type": "", "value": ""}
                        }
                    ]
                }
            }
        """.trimIndent()
        
        mockServer.enqueue(MockResponse()
            .setResponseCode(200)
            .setBody(responseBody)
            .setHeader("Content-Type", "application/json"))
    }
    
    private fun mockResponseWithDisabledParent() {
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
                            "enabled": false,
                            "level": 0,
                            "parent_id": null,
                            "app_id": "app-123",
                            "has_activation_rule": false,
                            "activation_rule": {"type": "", "value": ""}
                        },
                        {
                            "id": "toggle-2",
                            "path": "user.payments",
                            "value": "payments",
                            "enabled": true,
                            "level": 1,
                            "parent_id": "toggle-1",
                            "app_id": "app-123",
                            "has_activation_rule": false,
                            "activation_rule": {"type": "", "value": ""}
                        },
                        {
                            "id": "toggle-3",
                            "path": "user.payments.view-table",
                            "value": "view-table",
                            "enabled": true,
                            "level": 2,
                            "parent_id": "toggle-2",
                            "app_id": "app-123",
                            "has_activation_rule": false,
                            "activation_rule": {"type": "", "value": ""}
                        }
                    ]
                }
            }
        """.trimIndent()
        
        mockServer.enqueue(MockResponse()
            .setResponseCode(200)
            .setBody(responseBody)
            .setHeader("Content-Type", "application/json"))
    }
    
    private fun mockResponseWithPercentageRule() {
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
                            "activation_rule": {"type": "", "value": ""}
                        },
                        {
                            "id": "toggle-2",
                            "path": "user.payments",
                            "value": "payments",
                            "enabled": true,
                            "level": 1,
                            "parent_id": "toggle-1",
                            "app_id": "app-123",
                            "has_activation_rule": false,
                            "activation_rule": {"type": "", "value": ""}
                        },
                        {
                            "id": "toggle-3",
                            "path": "user.payments.view-table",
                            "value": "view-table",
                            "enabled": true,
                            "level": 2,
                            "parent_id": "toggle-2",
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
    }
    
    private fun mockResponseWithParameterRule() {
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
                            "activation_rule": {"type": "", "value": ""}
                        },
                        {
                            "id": "toggle-2",
                            "path": "user.payments",
                            "value": "payments",
                            "enabled": true,
                            "level": 1,
                            "parent_id": "toggle-1",
                            "app_id": "app-123",
                            "has_activation_rule": false,
                            "activation_rule": {"type": "", "value": ""}
                        },
                        {
                            "id": "toggle-3",
                            "path": "user.payments.view-table",
                            "value": "view-table",
                            "enabled": true,
                            "level": 2,
                            "parent_id": "toggle-2",
                            "app_id": "app-123",
                            "has_activation_rule": true,
                            "activation_rule": {"type": "parameter", "value": "premium"}
                        }
                    ]
                }
            }
        """.trimIndent()
        
        mockServer.enqueue(MockResponse()
            .setResponseCode(200)
            .setBody(responseBody)
            .setHeader("Content-Type", "application/json"))
    }
}