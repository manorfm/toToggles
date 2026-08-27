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
    
    // Scenarios spelled out explicitly by the user for a 3-level path t1.t2.t3: only the
    // segments actually named in the QUERIED path are ever evaluated, in root-to-target order,
    // and any one of them failing (disabled, or a failed rule) makes the whole query false — a
    // segment beyond the queried path (e.g. t3 when asking about "t1.t2") never enters the
    // evaluation at all, no matter its own state.
    @Test
    fun `hierarchy - only t3 disabled - blocks only queries that include t3`() {
        mockResponseWithHierarchy(t1Enabled = true, t2Enabled = true, t3Enabled = false)
        client.start()

        assertThat(client.isActive("t1.t2.t3")).isFalse()
        assertThat(client.isActive("t1.t2")).isTrue()
        assertThat(client.isActive("t1")).isTrue()
    }

    @Test
    fun `hierarchy - t1 (root) disabled - blocks every query under it regardless of t2 and t3`() {
        mockResponseWithHierarchy(t1Enabled = false, t2Enabled = true, t3Enabled = true)
        client.start()

        assertThat(client.isActive("t1.t2.t3")).isFalse()
        assertThat(client.isActive("t1.t2")).isFalse()
        assertThat(client.isActive("t1")).isFalse()
    }

    @Test
    fun `hierarchy - only t2 (middle) disabled - blocks queries through t2, not a query for t1 alone`() {
        mockResponseWithHierarchy(t1Enabled = true, t2Enabled = false, t3Enabled = true)
        client.start()

        assertThat(client.isActive("t1.t2.t3")).isFalse()
        assertThat(client.isActive("t1.t2")).isFalse()
        assertThat(client.isActive("t1")).isTrue()
    }

    // Regression test for the real bug found in this session: an ancestor's activation rule used
    // to be evaluated via strategyFactory.evaluate(ancestorRule) with NO parameter, discarding
    // whatever the caller passed to isActive(path, parameter). For match-based rule types
    // (user_id, parameter, country, canary) that meant the ancestor's rule could never pass, no
    // matter what parameter was supplied — the whole path was silently always false.
    @Test
    fun `hierarchy - a rule on the ANCESTOR (not the leaf) now respects the parameter passed to isActive`() {
        mockResponseWithHierarchy(
            t1Enabled = true, t2Enabled = true, t3Enabled = true,
            t1Rule = "user_id" to "42,99",
        )
        client.start()

        assertThat(client.isActive("t1.t2", "42")).isTrue()
        assertThat(client.isActive("t1.t2", "1")).isFalse()
        assertThat(client.isActive("t1.t2")).isFalse() // no parameter — can never match user_id
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
    fun `should evaluate user_id activation rules end to end (previously unregistered, always false)`() {
        mockResponseWithUserIdRule()
        client.start()

        assertThat(client.isActive("user.payments.view-table", "48")).isTrue()
        assertThat(client.isActive("user.payments.view-table", "999")).isFalse()
        assertThat(client.isActive("user.payments.view-table")).isFalse()
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
                            "has_activation_rule": false,
                            "activation_rule": null
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
                            "activation_rule": null
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
    }
    
    // Builds a 3-level t1 -> t1.t2 -> t1.t2.t3 hierarchy with each level's `enabled` flag and an
    // optional rule on t1 (type to value) independently configurable — used to cover the
    // hierarchical-evaluation scenarios spelled out explicitly by the user, without duplicating a
    // near-identical fixture per scenario.
    private fun mockResponseWithHierarchy(
        t1Enabled: Boolean,
        t2Enabled: Boolean,
        t3Enabled: Boolean,
        t1Rule: Pair<String, String>? = null,
    ) {
        val t1HasRule = t1Rule != null
        val t1RuleJson = if (t1Rule != null) """{"type": "${t1Rule.first}", "value": "${t1Rule.second}"}""" else "null"
        val responseBody = """
            {
                "application": {
                    "id": "app-123",
                    "name": "Test App",
                    "toggles": [
                        {
                            "id": "toggle-t1",
                            "path": "t1",
                            "value": "t1",
                            "enabled": $t1Enabled,
                            "level": 0,
                            "parent_id": null,
                            "app_id": "app-123",
                            "has_activation_rule": $t1HasRule,
                            "activation_rule": $t1RuleJson
                        },
                        {
                            "id": "toggle-t2",
                            "path": "t1.t2",
                            "value": "t2",
                            "enabled": $t2Enabled,
                            "level": 1,
                            "parent_id": "toggle-t1",
                            "app_id": "app-123",
                            "has_activation_rule": false,
                            "activation_rule": null
                        },
                        {
                            "id": "toggle-t3",
                            "path": "t1.t2.t3",
                            "value": "t3",
                            "enabled": $t3Enabled,
                            "level": 2,
                            "parent_id": "toggle-t2",
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
                            "has_activation_rule": false,
                            "activation_rule": null
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
                            "has_activation_rule": false,
                            "activation_rule": null
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
                            "has_activation_rule": false,
                            "activation_rule": null
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

    private fun mockResponseWithUserIdRule() {
        val responseBody = """
            {
                "application": {
                    "id": "app-123",
                    "name": "Test App",
                    "toggles": [
                        {
                            "id": "toggle-1",
                            "path": "user.payments.view-table",
                            "value": "view-table",
                            "enabled": true,
                            "level": 0,
                            "parent_id": null,
                            "app_id": "app-123",
                            "has_activation_rule": true,
                            "activation_rule": {"type": "user_id", "value": "12,48,103"}
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