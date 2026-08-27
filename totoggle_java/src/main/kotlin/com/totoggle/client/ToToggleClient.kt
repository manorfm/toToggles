package com.totoggle.client

import com.totoggle.client.cache.ToggleCache
import com.totoggle.client.config.ToToggleConfig
import com.totoggle.client.exception.NetworkException
import com.totoggle.client.http.HttpClient
import com.totoggle.client.metrics.ToToggleMetricsListener
import com.totoggle.client.model.Toggle
import com.totoggle.client.strategy.StrategyFactory
import org.slf4j.LoggerFactory
import java.time.Duration
import java.time.Instant
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
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

    companion object {
        // A cache is considered stale once this many refresh intervals have passed with no
        // successful update — e.g. with the default 5-minute interval, no successful refresh in
        // 10 minutes. Only actually reachable when enableOfflineMode=true, since otherwise a
        // failing refresh already surfaces loudly (see isHealthy()/isStale()).
        private const val STALE_THRESHOLD_INTERVALS = 2
    }

    private val logger = LoggerFactory.getLogger(ToToggleClient::class.java)

    private val httpClient = HttpClient(config)
    private val cache = ToggleCache()
    private val strategyFactory = StrategyFactory(config.timeZone)
    private val metricsListeners = CopyOnWriteArrayList<ToToggleMetricsListener>()

    private val scheduler: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor { r ->
        Thread(r, "ToToggle-Refresh-${config.applicationName}").apply {
            isDaemon = true
        }
    }

    private val isStarted = AtomicBoolean(false)
    private val isShutdown = AtomicBoolean(false)
    private val lastError = AtomicReference<Exception?>()
    private val lastErrorTime = AtomicReference<Instant?>()
    private val consecutiveFailureCount = AtomicInteger(0)
    
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
     * Registers a listener for refresh/evaluation observability events (see
     * [ToToggleMetricsListener]). Safe to call before or after [start].
     */
    fun addMetricsListener(listener: ToToggleMetricsListener) {
        metricsListeners.add(listener)
    }

    /** Unregisters a previously-registered listener. */
    fun removeMetricsListener(listener: ToToggleMetricsListener) {
        metricsListeners.remove(listener)
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

        val result = try {
            logger.debug("Checking toggle: path='{}', parameter='{}'", path, parameter)

            val toggle = cache.getToggle(path)
            if (toggle == null) {
                // WARN, not debug: this always resolves to false and is almost always a caller
                // mistake (a typo in the path, or asking before the first successful refresh
                // completed) — the same class of "silent always-false" issue as evaluating a
                // rule with a missing parameter (see StrategyFactory#evaluate).
                logger.warn(
                    "Toggle not found: '{}' — isActive() returns false. Check for a typo, or " +
                        "that the toggle exists in the configured application ({} toggles currently cached).",
                    path, cache.getStats().toggleCount
                )
                false
            } else if (!areParentsActive(path, parameter)) {
                logger.debug("Parent toggles are not active for path: {}", path)
                false
            } else if (!toggle.enabled) {
                logger.debug("Toggle is disabled: {}", path)
                false
            } else {
                // Evaluate activation rules if present. `hasActivationRule` is the only
                // trustworthy signal (matches the server-side and frontend convention) —
                // `activationRule` itself can be null even when the flag is true in principle,
                // so guard defensively rather than force-unwrap.
                val rule = toggle.activationRule
                if (toggle.hasActivationRule && rule != null) {
                    val ruleResult = strategyFactory.evaluate(rule, parameter)
                    logger.debug("Activation rule evaluation: path='{}', rule='{}/{}', result={}",
                        path, rule.type, rule.value, ruleResult)
                    ruleResult
                } else {
                    logger.debug("No activation rules for toggle: {}", path)
                    true
                }
            }
        } catch (e: Exception) {
            logger.error("Error checking toggle: {}", path, e)
            false
        }

        logger.debug("Final result for toggle '{}': {}", path, result)
        notifyEvaluation(path, result)
        return result
    }
    
    /**
     * Validates that all parent toggles are active (cascading validation).
     *
     * For example, for path "user.payments.view-table":
     * - Checks that "user" is enabled (and its activation rule, if any)
     * - Checks that "user.payments" is enabled (and its activation rule, if any)
     *
     * The same [parameter] passed to [isActive] is forwarded to every ancestor's rule
     * evaluation, not just the target toggle's — a rule configured on an ancestor is exactly as
     * real as one configured on the toggle itself, so it needs the same context to evaluate
     * correctly (e.g. consistent percentage hashing, or a parameter/user_id/country/canary
     * match). Evaluating an ancestor's rule with no parameter used to always fail it for those
     * four match-based types, silently blocking the whole path regardless of what the caller
     * passed in.
     *
     * @param path The toggle path
     * @param parameter Optional parameter for rule evaluation, forwarded to every ancestor
     * @return true if all parents are active, false otherwise
     */
    private fun areParentsActive(path: String, parameter: String?): Boolean {
        val ancestors = cache.getAncestors(path)

        for (ancestor in ancestors) {
            if (!ancestor.enabled) {
                logger.debug("Parent toggle '{}' is disabled, blocking child '{}'", ancestor.path, path)
                return false
            }

            // Check activation rules for parents too
            val ancestorRule = ancestor.activationRule
            if (ancestor.hasActivationRule && ancestorRule != null) {
                val ruleResult = strategyFactory.evaluate(ancestorRule, parameter)
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
        return "Cache: ${stats.toggleCount} toggles, last update: ${stats.lastUpdateTime}, " +
            "app: ${stats.applicationName}, stale: ${isStale()}, consecutiveFailures: ${consecutiveFailureCount.get()}"
    }

    /**
     * Gets the last error that occurred during operations.
     */
    fun getLastError(): Exception? = lastError.get()

    /** When [getLastError] last occurred, or null if there hasn't been one (yet). */
    fun getLastErrorTime(): Instant? = lastErrorTime.get()

    /**
     * How many refresh attempts have failed in a row, reset to 0 on the next success. A single
     * failure is normal (a transient blip); a growing count means the server/network has been
     * unreachable for a while — useful for alerting thresholds that a one-off WARN log doesn't
     * give you.
     */
    fun getConsecutiveFailureCount(): Int = consecutiveFailureCount.get()

    /**
     * Whether the cached data is older than expected — no successful refresh in more than
     * [STALE_THRESHOLD_INTERVALS] times the configured [ToToggleConfig.refreshInterval]. A cache
     * can have data ([com.totoggle.client.cache.ToggleCache.hasData] = true) and still be stale
     * if the background refresh has been failing silently for a while — only actually reachable
     * when [ToToggleConfig.enableOfflineMode] is true, since otherwise a failing refresh already
     * surfaces loudly. Returns true if there has never been a successful refresh at all.
     */
    fun isStale(): Boolean {
        val lastUpdate = cache.getLastUpdateTime() ?: return true
        val staleThreshold = config.refreshInterval.multipliedBy(STALE_THRESHOLD_INTERVALS.toLong())
        return Duration.between(lastUpdate, Instant.now()) > staleThreshold
    }

    /**
     * Checks if the client is healthy: started, not shut down, has data, and that data isn't
     * stale (see [isStale]) — a client silently serving very old cached data (background refresh
     * failing for a long time under offline mode) is not "healthy" just because it technically
     * has some data to answer with.
     */
    fun isHealthy(): Boolean {
        return isStarted.get() && !isShutdown.get() && cache.hasData() && !isStale()
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
            consecutiveFailureCount.set(0)
            notifyRefreshSuccess(response.application.toggles.size)

        } catch (e: NetworkException) {
            lastError.set(e)
            lastErrorTime.set(Instant.now())
            val failures = consecutiveFailureCount.incrementAndGet()

            if (config.enableOfflineMode && cache.hasData()) {
                logger.warn("Network error during refresh (consecutive failures: {}), continuing with cached data: {}", failures, e.message)
            } else {
                logger.error("Network error during refresh and no cached data available", e)
            }
            notifyRefreshFailure(e, failures)

        } catch (e: Exception) {
            lastError.set(e)
            lastErrorTime.set(Instant.now())
            val failures = consecutiveFailureCount.incrementAndGet()
            logger.error("Unexpected error during refresh", e)
            notifyRefreshFailure(e, failures)
        }
    }

    private fun notifyRefreshSuccess(toggleCount: Int) {
        for (listener in metricsListeners) {
            try {
                listener.onRefreshSuccess(toggleCount)
            } catch (e: Exception) {
                logger.warn("Metrics listener threw from onRefreshSuccess — ignoring", e)
            }
        }
    }

    private fun notifyRefreshFailure(error: Exception, consecutiveFailures: Int) {
        for (listener in metricsListeners) {
            try {
                listener.onRefreshFailure(error, consecutiveFailures)
            } catch (e: Exception) {
                logger.warn("Metrics listener threw from onRefreshFailure — ignoring", e)
            }
        }
    }

    private fun notifyEvaluation(path: String, result: Boolean) {
        for (listener in metricsListeners) {
            try {
                listener.onEvaluation(path, result)
            } catch (e: Exception) {
                logger.warn("Metrics listener threw from onEvaluation — ignoring", e)
            }
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