package com.totoggle.client.config

import java.time.Duration

/**
 * Configuration for the ToToggle client.
 * 
 * @property applicationName Name of the application (used for logging)
 * @property serverUrl Base URL of the ToToggle server (e.g., "https://your-domain.com")
 * @property secretKey Secret key for API authentication
 * @property refreshInterval How often to refresh toggles from server
 * @property connectionTimeout HTTP connection timeout
 * @property readTimeout HTTP read timeout
 * @property enableOfflineMode Whether to continue working when server is unreachable
 * @property logLevel Logging level for the client
 */
data class ToToggleConfig(
    val applicationName: String,
    val serverUrl: String,
    val secretKey: String,
    val refreshInterval: Duration = Duration.ofMinutes(5),
    val connectionTimeout: Duration = Duration.ofSeconds(10),
    val readTimeout: Duration = Duration.ofSeconds(30),
    val enableOfflineMode: Boolean = true,
    val logLevel: LogLevel = LogLevel.INFO
) {
    
    init {
        require(applicationName.isNotBlank()) { "Application name cannot be blank" }
        require(serverUrl.isNotBlank()) { "Server URL cannot be blank" }
        require(secretKey.isNotBlank()) { "Secret key cannot be blank" }
        require(secretKey.startsWith("sk_")) { "Secret key must start with 'sk_'" }
        require(refreshInterval.toMillis() > 0) { "Refresh interval must be positive" }
        require(connectionTimeout.toMillis() > 0) { "Connection timeout must be positive" }
        require(readTimeout.toMillis() > 0) { "Read timeout must be positive" }
    }
    
    /**
     * Gets the full API URL for toggles endpoint.
     */
    fun getApiUrl(): String {
        val baseUrl = serverUrl.trimEnd('/')
        return "$baseUrl/api/toggles"
    }
    
    companion object {
        /**
         * Creates a builder for ToToggleConfig.
         */
        fun builder(): Builder = Builder()
    }
    
    /**
     * Builder pattern for creating ToToggleConfig instances.
     */
    class Builder {
        private var applicationName: String = ""
        private var serverUrl: String = ""
        private var secretKey: String = ""
        private var refreshInterval: Duration = Duration.ofMinutes(5)
        private var connectionTimeout: Duration = Duration.ofSeconds(10)
        private var readTimeout: Duration = Duration.ofSeconds(30)
        private var enableOfflineMode: Boolean = true
        private var logLevel: LogLevel = LogLevel.INFO
        
        fun applicationName(applicationName: String) = apply { this.applicationName = applicationName }
        fun serverUrl(serverUrl: String) = apply { this.serverUrl = serverUrl }
        fun secretKey(secretKey: String) = apply { this.secretKey = secretKey }
        fun refreshInterval(refreshInterval: Duration) = apply { this.refreshInterval = refreshInterval }
        fun connectionTimeout(connectionTimeout: Duration) = apply { this.connectionTimeout = connectionTimeout }
        fun readTimeout(readTimeout: Duration) = apply { this.readTimeout = readTimeout }
        fun enableOfflineMode(enableOfflineMode: Boolean) = apply { this.enableOfflineMode = enableOfflineMode }
        fun logLevel(logLevel: LogLevel) = apply { this.logLevel = logLevel }
        
        fun build(): ToToggleConfig {
            return ToToggleConfig(
                applicationName = applicationName,
                serverUrl = serverUrl,
                secretKey = secretKey,
                refreshInterval = refreshInterval,
                connectionTimeout = connectionTimeout,
                readTimeout = readTimeout,
                enableOfflineMode = enableOfflineMode,
                logLevel = logLevel
            )
        }
    }
}