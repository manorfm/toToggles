package com.totoggle.client

import com.totoggle.client.cache.ToggleCache
import com.totoggle.client.config.ToToggleConfig
import com.totoggle.client.exception.NetworkException
import com.totoggle.client.http.HttpClient
import com.totoggle.client.model.Toggle
import com.totoggle.client.strategy.StrategyFactory
import org.slf4j.LoggerFactory
import java.time.Duration
import java.time.Instant
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/**
 * Main client class for interacting with the ToToggle feature flag service.
 * 
 * This class provides the primary interface for checking if feature toggles are active.
 * It handles communication with the server, caching, and resilience features.
 * 
 * Usage example:
 * ```kotlin
 * val config = ToToggleConfig.builder()
 *     .applicationName("my-app")
 *     .serverUrl("https://toggle-server.com")
 *     .secretKey("sk_your_secret_key_here")
 *     .build()
 * 
 * val client = ToToggleClient(config)
 * client.start()
 * 
 * // Check if a toggle is active
 * val isActive = client.isActive("user.payments.view-table")
 * 
 * // Check with parameter
 * val isActiveForPremium = client.isActive("user.payments.view-table", "premium")
 * 
 * client.shutdown()
 * ```
 */
class ToToggleClient(private val config: ToToggleConfig) {
    
    private val logger = LoggerFactory.getLogger(ToToggleClient::class.java)
    
    private val httpClient = HttpClient(config)
    private val cache = ToggleCache()
    private val strategyFactory = StrategyFactory()
    
    private val scheduler: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor { r ->
        Thread(r, "ToToggle-Refresh-${config.applicationName}").apply {
            isDaemon = true
        }
    }
    
    private val isStarted = AtomicBoolean(false)
    private val isShutdown = AtomicBoolean(false)
    private val lastError = AtomicReference<Exception?>()
    
    /**
     * Starts the ToToggle client.
     * This initializes the cache and starts the background refresh process.
     */
    fun start() {
        if (isShutdown.get()) {
            throw IllegalStateException("Client has been shut down and cannot be restarted")
        }
        
        if (!isStarted.compareAndSet(false, true)) {
            logger.warn("Client is already started")
            return
        }
        
        logger.info("Starting ToToggle client for application: {}", config.applicationName)
        
        // Initial fetch
        refreshToggles()
        
        // Schedule periodic refresh
        scheduler.scheduleAtFixedRate(
            { refreshToggles() },
            config.refreshInterval.toMillis(),
            config.refreshInterval.toMillis(),
            TimeUnit.MILLISECONDS
        )
        
        logger.info("ToToggle client started successfully. Refresh interval: {}", config.refreshInterval)
    }
    
    /**
     * Checks if a toggle is active for the given path.
     * 
     * This method implements cascading validation:
     * 1. Checks if the toggle exists (returns false if not found)
     * 2. Validates all parent toggles are enabled
     * 3. Checks if the target toggle is enabled
     * 4. Evaluates activation rules if present
     * 
     * @param path The toggle path (e.g., "user.payments.view-table")
     * @param parameter Optional parameter for rule evaluation
     * @return true if the toggle is active, false otherwise
     */
    fun isActive(path: String, parameter: String? = null): Boolean {
        validateStarted()
        
        return try {
            logger.debug("Checking toggle: path='{}', parameter='{}'", path, parameter)
            
            // Check if toggle exists
            val toggle = cache.getToggle(path)
            if (toggle == null) {
                logger.debug("Toggle not found: {}", path)
                return false
            }
            
            // Validate parent toggles (cascading validation)
            if (!areParentsActive(path)) {
                logger.debug("Parent toggles are not active for path: {}", path)
                return false
            }
            
            // Check if the toggle itself is enabled
            if (!toggle.enabled) {
                logger.debug("Toggle is disabled: {}", path)
                return false
            }
            
            // Evaluate activation rules if present
            val result = if (toggle.hasActivationRule) {
                val ruleResult = strategyFactory.evaluate(toggle.activationRule, parameter)
                logger.debug("Activation rule evaluation: path='{}', rule='{}/{}', result={}", 
                    path, toggle.activationRule.type, toggle.activationRule.value, ruleResult)
                ruleResult
            } else {
                logger.debug("No activation rules for toggle: {}", path)
                true
            }
            
            logger.debug("Final result for toggle '{}': {}", path, result)
            result
            
        } catch (e: Exception) {
            logger.error("Error checking toggle: {}", path, e)
            false
        }
    }
    
    /**
     * Validates that all parent toggles are active (cascading validation).
     * 
     * For example, for path "user.payments.view-table":
     * - Checks that "user" is enabled
     * - Checks that "user.payments" is enabled
     * 
     * @param path The toggle path
     * @return true if all parents are active, false otherwise
     */
    private fun areParentsActive(path: String): Boolean {
        val ancestors = cache.getAncestors(path)
        
        for (ancestor in ancestors) {
            if (!ancestor.enabled) {
                logger.debug("Parent toggle '{}' is disabled, blocking child '{}'", ancestor.path, path)
                return false
            }
            
            // Check activation rules for parents too
            if (ancestor.hasActivationRule) {
                val ruleResult = strategyFactory.evaluate(ancestor.activationRule)
                if (!ruleResult) {
                    logger.debug("Parent toggle '{}' failed activation rule, blocking child '{}'", ancestor.path, path)
                    return false
                }
            }
        }
        
        return true
    }
    
    /**
     * Forces a refresh of toggle data from the server.
     */
    fun refresh() {
        validateStarted()
        refreshToggles()
    }
    
    /**
     * Gets information about the current cache state.
     */
    fun getCacheInfo(): String {
        val stats = cache.getStats()
        return "Cache: ${stats.toggleCount} toggles, last update: ${stats.lastUpdateTime}, app: ${stats.applicationName}"
    }
    
    /**
     * Gets the last error that occurred during operations.
     */
    fun getLastError(): Exception? = lastError.get()
    
    /**
     * Checks if the client is healthy (started and has data).
     */
    fun isHealthy(): Boolean {
        return isStarted.get() && !isShutdown.get() && cache.hasData()
    }
    
    /**
     * Shuts down the client and releases resources.
     */
    fun shutdown() {
        if (!isShutdown.compareAndSet(false, true)) {
            logger.warn("Client is already shut down")
            return
        }
        
        logger.info("Shutting down ToToggle client")
        
        try {
            scheduler.shutdown()
            if (!scheduler.awaitTermination(5, TimeUnit.SECONDS)) {
                scheduler.shutdownNow()
            }
        } catch (e: InterruptedException) {
            scheduler.shutdownNow()
            Thread.currentThread().interrupt()
        }
        
        httpClient.close()
        cache.clear()
        
        logger.info("ToToggle client shut down completed")
    }
    
    /**
     * Refreshes toggle data from the server.
     */
    private fun refreshToggles() {
        try {
            logger.debug("Refreshing toggles from server")
            val response = httpClient.fetchToggles()
            cache.updateCache(response)
            lastError.set(null)
            
        } catch (e: NetworkException) {
            lastError.set(e)
            
            if (config.enableOfflineMode && cache.hasData()) {
                logger.warn("Network error during refresh, continuing with cached data: {}", e.message)
            } else {
                logger.error("Network error during refresh and no cached data available", e)
            }
            
        } catch (e: Exception) {
            lastError.set(e)
            logger.error("Unexpected error during refresh", e)
        }
    }
    
    /**
     * Validates that the client has been started.
     */
    private fun validateStarted() {
        if (!isStarted.get()) {
            throw IllegalStateException("Client must be started before use. Call start() first.")
        }
        
        if (isShutdown.get()) {
            throw IllegalStateException("Client has been shut down")
        }
    }
}