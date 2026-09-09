package com.totoggle.client

import com.totoggle.client.refresh.ExecutorRefreshScheduler
import com.totoggle.client.refresh.RefreshScheduler
import java.time.Instant

/**
 * Runtime collaborators for refresh scheduling. Supplying these makes refresh timing entirely
 * deterministic in tests; production callers should use the default constructor argument.
 */
data class ToToggleClientRuntime(
    val now: () -> Instant = Instant::now,
    val random: () -> Double = Math::random,
    val scheduler: RefreshScheduler,
) {
    companion object {
        fun production(applicationName: String): ToToggleClientRuntime = ToToggleClientRuntime(
            scheduler = ExecutorRefreshScheduler(applicationName),
        )
    }
}
