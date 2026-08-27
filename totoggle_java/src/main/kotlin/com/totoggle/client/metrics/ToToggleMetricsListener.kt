package com.totoggle.client.metrics

/**
 * Optional observability hook — register via `ToToggleClient#addMetricsListener` to wire
 * refresh/evaluation events into your own metrics system (Micrometer, Dropwizard, StatsD, plain
 * counters...) without this library taking on a dependency on any of them.
 *
 * All methods have empty default bodies, so an implementation only needs to override what it
 * cares about. A listener that throws is caught and logged (WARN) by the client — a broken
 * listener must never break toggle evaluation or the background refresh.
 */
interface ToToggleMetricsListener {

    /** Called after a successful background (or forced, via [com.totoggle.client.ToToggleClient.refresh]) refresh. */
    fun onRefreshSuccess(toggleCount: Int) {}

    /**
     * Called after a failed refresh attempt, with the running count of consecutive failures
     * (reset to 0 on the next success) — a single call means "just failed once"; a growing count
     * across calls means the server/network has been unreachable for a while.
     */
    fun onRefreshFailure(error: Exception, consecutiveFailures: Int) {}

    /** Called after every `isActive()` call that completed (including ones caught internally and resolved to `false`). */
    fun onEvaluation(path: String, result: Boolean) {}
}
