package com.totoggle.client.config

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.Duration

class ToToggleConfigTest {
    
    @Test
    fun `should create valid config with required parameters`() {
        val config = ToToggleConfig(
            applicationName = "test-app",
            serverUrl = "https://example.com",
            secretKey = "sk_test_key"
        )
        
        assertThat(config.applicationName).isEqualTo("test-app")
        assertThat(config.serverUrl).isEqualTo("https://example.com")
        assertThat(config.secretKey).isEqualTo("sk_test_key")
        assertThat(config.refreshInterval).isEqualTo(Duration.ofMinutes(5))
        assertThat(config.connectionTimeout).isEqualTo(Duration.ofSeconds(10))
        assertThat(config.readTimeout).isEqualTo(Duration.ofSeconds(30))
        assertThat(config.enableOfflineMode).isTrue()
        assertThat(config.logLevel).isEqualTo(LogLevel.INFO)
    }
    
    @Test
    fun `should validate application name`() {
        assertThatThrownBy {
            ToToggleConfig(
                applicationName = "",
                serverUrl = "https://example.com",
                secretKey = "sk_test_key"
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("Application name cannot be blank")
        
        assertThatThrownBy {
            ToToggleConfig(
                applicationName = "   ",
                serverUrl = "https://example.com",
                secretKey = "sk_test_key"
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("Application name cannot be blank")
    }
    
    @Test
    fun `should validate server URL`() {
        assertThatThrownBy {
            ToToggleConfig(
                applicationName = "test-app",
                serverUrl = "",
                secretKey = "sk_test_key"
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("Server URL cannot be blank")
        
        assertThatThrownBy {
            ToToggleConfig(
                applicationName = "test-app",
                serverUrl = "   ",
                secretKey = "sk_test_key"
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("Server URL cannot be blank")
    }
    
    @Test
    fun `should validate secret key`() {
        assertThatThrownBy {
            ToToggleConfig(
                applicationName = "test-app",
                serverUrl = "https://example.com",
                secretKey = ""
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("Secret key cannot be blank")
        
        assertThatThrownBy {
            ToToggleConfig(
                applicationName = "test-app",
                serverUrl = "https://example.com",
                secretKey = "invalid_key"
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("Secret key must start with 'sk_'")
    }
    
    @Test
    fun `should validate durations`() {
        assertThatThrownBy {
            ToToggleConfig(
                applicationName = "test-app",
                serverUrl = "https://example.com",
                secretKey = "sk_test_key",
                refreshInterval = Duration.ofMillis(0)
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("Refresh interval must be positive")
        
        assertThatThrownBy {
            ToToggleConfig(
                applicationName = "test-app",
                serverUrl = "https://example.com",
                secretKey = "sk_test_key",
                connectionTimeout = Duration.ofMillis(-1)
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("Connection timeout must be positive")
        
        assertThatThrownBy {
            ToToggleConfig(
                applicationName = "test-app",
                serverUrl = "https://example.com",
                secretKey = "sk_test_key",
                readTimeout = Duration.ofMillis(0)
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("Read timeout must be positive")
    }
    
    @Test
    fun `should build API URL correctly`() {
        val config1 = ToToggleConfig(
            applicationName = "test-app",
            serverUrl = "https://example.com",
            secretKey = "sk_test_key"
        )
        
        val config2 = ToToggleConfig(
            applicationName = "test-app",
            serverUrl = "https://example.com/",
            secretKey = "sk_test_key"
        )
        
        assertThat(config1.getApiUrl()).isEqualTo("https://example.com/api/toggles")
        assertThat(config2.getApiUrl()).isEqualTo("https://example.com/api/toggles")
    }
    
    @Test
    fun `should use builder pattern correctly`() {
        val config = ToToggleConfig.builder()
            .applicationName("test-app")
            .serverUrl("https://example.com")
            .secretKey("sk_test_key")
            .refreshInterval(Duration.ofMinutes(10))
            .connectionTimeout(Duration.ofSeconds(5))
            .readTimeout(Duration.ofSeconds(15))
            .enableOfflineMode(false)
            .logLevel(LogLevel.DEBUG)
            .build()
        
        assertThat(config.applicationName).isEqualTo("test-app")
        assertThat(config.serverUrl).isEqualTo("https://example.com")
        assertThat(config.secretKey).isEqualTo("sk_test_key")
        assertThat(config.refreshInterval).isEqualTo(Duration.ofMinutes(10))
        assertThat(config.connectionTimeout).isEqualTo(Duration.ofSeconds(5))
        assertThat(config.readTimeout).isEqualTo(Duration.ofSeconds(15))
        assertThat(config.enableOfflineMode).isFalse()
        assertThat(config.logLevel).isEqualTo(LogLevel.DEBUG)
    }
    
    @Test
    fun `should build with defaults when using builder`() {
        val config = ToToggleConfig.builder()
            .applicationName("test-app")
            .serverUrl("https://example.com")
            .secretKey("sk_test_key")
            .build()
        
        assertThat(config.refreshInterval).isEqualTo(Duration.ofMinutes(5))
        assertThat(config.connectionTimeout).isEqualTo(Duration.ofSeconds(10))
        assertThat(config.readTimeout).isEqualTo(Duration.ofSeconds(30))
        assertThat(config.enableOfflineMode).isTrue()
        assertThat(config.logLevel).isEqualTo(LogLevel.INFO)
    }
}