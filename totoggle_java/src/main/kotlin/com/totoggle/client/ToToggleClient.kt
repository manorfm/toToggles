package com.totoggle.client

import com.totoggle.client.cache.ToggleCache
import com.totoggle.client.config.ToToggleConfig
import com.totoggle.client.exception.NetworkException
import com.totoggle.client.http.HttpClient
import com.totoggle.client.http.ToggleFetchResult
import com.totoggle.client.metrics.ToToggleMetricsListener
import com.totoggle.client.model.Toggle
import com.totoggle.client.refresh.ScheduledRefresh
import com.totoggle.client.strategy.StrategyFactory
import org.slf4j.LoggerFactory
import java.time.Duration
import java.time.Instant
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

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
 * // Context is resolved by the configured middleware-backed resolver.
 * val isActive = client.isActive("user.payments.view-table")
 * 
 * client.shutdown()
 * ```
 */
class ToToggleClient(
    private val config: ToToggleConfig,
    private val runtime: ToToggleClientRuntime = ToToggleClientRuntime.production(config.applicationName),
) {

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

    private val scheduler = runtime.scheduler
    @Volatile private var scheduledRefresh: ScheduledRefresh? = null
    private val schedulingLock = ReentrantLock()
    private var refreshScheduleGeneration = 0L

    private val isStarted = AtomicBoolean(false)
    private val isShutdown = AtomicBoolean(false)
    private val lastError = AtomicReference<Exception?>()
    private val lastErrorTime = AtomicReference<Instant?>()
    private val consecutiveFailureCount = AtomicInteger(0)
    private val refreshLock = ReentrantLock()
    
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
        
        scheduleRefresh()
        
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
     * @return true if the toggle is active, false otherwise
     */
    fun isActive(path: String): Boolean {
        val result = try {
            validateStarted()
            logger.debug("Checking toggle: path='{}'", path)

            val toggle = cache.getToggle(path)
            if (toggle == null) {
                // WARN, not debug: this always resolves to false and is almost always a caller
                // mistake (a typo in the path, or asking before the first successful refresh
                // completed) — the same class of "silent always-false" issue as evaluating a
                // rule with missing request context (see StrategyFactory#evaluate).
                logger.warn(
                    "Toggle not found: '{}' — isActive() returns false. Check for a typo, or " +
                        "that the toggle exists in the configured application ({} toggles currently cached).",
                    path, cache.getStats().toggleCount
                )
                false
            } else if (!areParentsActive(path)) {
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
                    val ruleResult = evaluateRule(rule, toggle.path)
                    logger.debug("Activation rule evaluated: path='{}', ruleType='{}', result={}",
                        path, rule.type, ruleResult)
                    ruleResult
                } else {
                    logger.debug("No activation rules for toggle: {}", path)
                    true
                }
            }
        } catch (_: Exception) {
            logger.error("Error checking toggle; returning false")
            false
        }

        logger.debug("Final result for toggle '{}': {}", path, result)
        notifyEvaluation(path, result)
        return result
    }
    
    /**
     * Validates that all parent toggles are enabled (hierarchical validation).
     *
     * For example, for path "user.payments.view-table":
     * - Checks that "user" is enabled
     * - Checks that "user.payments" is enabled
     *
     * Activation rules are intentionally evaluated only for the requested toggle; an ancestor
     * rule never cascades to a descendant.
     *
     * @param path The toggle path
     * @return true if all parents are enabled, false otherwise
     */
    private fun areParentsActive(path: String): Boolean {
        val ancestors = cache.getAncestors(path)

        for (ancestor in ancestors) {
            if (!ancestor.enabled) {
                logger.debug("Parent toggle '{}' is disabled, blocking child '{}'", ancestor.path, path)
                return false
            }

        }

        return true
    }

    /** Rules are local to their toggle. Missing context is warned and fails closed. */
    private fun evaluateRule(rule: com.totoggle.client.model.ActivationRule, path: String): Boolean {
        return try {
            if (!rule.hasCanonicalContextKey()) {
                logger.warn("Activation rule has an invalid type/context-key pair; returning false")
                return false
            }
            if (rule.type == "time") return strategyFactory.evaluate(rule, null)
            val contextKey = rule.config?.get("context_key")?.asText()
            if (contextKey.isNullOrBlank()) {
                logger.warn("Activation rule type '{}' has no valid context_key; returning false", rule.type)
                return false
            }
            val rawKey = config.contextResolver?.resolve(contextKey)
            if (rawKey.isNullOrBlank()) {
                logger.warn("Activation rule context is absent; returning false")
                false
            } else {
                val key = if (rule.type == "percentage") "$path:$rawKey" else rawKey
                strategyFactory.evaluate(rule, key)
            }
        } catch (_: Exception) {
            logger.warn("Toggle context resolution or rule evaluation failed; returning false")
            false
        }
    }
    
    /**
     * Forces a refresh of toggle data from the server.
     */
    fun refresh() {
        validateStarted()
        refreshToggles()
        scheduleRefresh()
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
        return Duration.between(lastUpdate, runtime.now()) > staleThreshold
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
        
        schedulingLock.withLock {
            refreshScheduleGeneration++
            scheduledRefresh?.cancel()
            scheduledRefresh = null
        }
        scheduler.close()

        // Refresh owns this lock while a response is parsed and applied. Waiting for it makes
        // cache clearing the terminal lifecycle action: an in-flight response cannot resurrect
        // state after shutdown has completed.
        refreshLock.withLock {
            httpClient.close()
            cache.clear()
        }
        
        logger.info("ToToggle client shut down completed")
    }
    
    /**
     * Refreshes toggle data from the server.
     */
    private fun scheduleRefresh() {
        schedulingLock.withLock {
            if (!isStarted.get() || isShutdown.get()) return
            scheduledRefresh?.cancel()
            val generation = ++refreshScheduleGeneration
            scheduledRefresh = scheduler.schedule(
                { runScheduledRefresh(generation) },
                nextRefreshDelay(),
            )
        }
    }

    private fun runScheduledRefresh(generation: Long) {
        val shouldRefresh = schedulingLock.withLock {
            if (generation != refreshScheduleGeneration || isShutdown.get()) {
                false
            } else {
                scheduledRefresh = null
                true
            }
        }
        if (!shouldRefresh) return
        refreshToggles()
        scheduleRefresh()
    }

    private fun nextRefreshDelay(): Duration {
        if (consecutiveFailureCount.get() == 0) return config.refreshInterval
        var delay = config.refreshInterval
        repeat((consecutiveFailureCount.get() - 1).coerceAtMost(30)) {
            delay = delay.multipliedBy(2).coerceAtMost(config.refreshBackoffMax)
        }
        val sampled = runtime.random().takeIf { it.isFinite() }?.coerceIn(0.0, 0.999999) ?: 0.5
        val factorMicros = ((0.8 + 0.4 * sampled) * 1_000_000).toLong()
        return delay.multipliedBy(factorMicros).dividedBy(1_000_000).coerceAtMost(config.refreshBackoffMax)
    }

    private fun refreshToggles(): Boolean = refreshLock.withLock {
		if (isShutdown.get()) return false
        try {
            logger.debug("Refreshing toggles from server")
            when (val response = httpClient.fetchToggles(cache.getCatalogueVersion()?.etag)) {
                is ToggleFetchResult.Modified -> cache.updateCache(response.response, response.etag, runtime.now())
                is ToggleFetchResult.NotModified -> {
                    if (!cache.hasData()) throw NetworkException("Received 304 before an initial catalogue")
                    cache.markFresh(response.etag, runtime.now())
                }
            }
			if (isShutdown.get()) return false
            lastError.set(null)
            consecutiveFailureCount.set(0)
            notifyRefreshSuccess(cache.getStats().toggleCount)
            return true

        } catch (e: NetworkException) {
			if (isShutdown.get()) return false
            lastError.set(e)
            lastErrorTime.set(runtime.now())
            val failures = consecutiveFailureCount.incrementAndGet()

            if (config.enableOfflineMode && cache.hasData()) {
                logger.warn("Network error during refresh (consecutive failures: {}), continuing with cached data: {}", failures, e.message)
            } else {
                logger.error("Network error during refresh and no cached data available", e)
            }
            notifyRefreshFailure(e, failures)
            return false

        } catch (e: Exception) {
			if (isShutdown.get()) return false
            lastError.set(e)
            lastErrorTime.set(runtime.now())
            val failures = consecutiveFailureCount.incrementAndGet()
            logger.error("Unexpected error during refresh", e)
            notifyRefreshFailure(e, failures)
            return false
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
