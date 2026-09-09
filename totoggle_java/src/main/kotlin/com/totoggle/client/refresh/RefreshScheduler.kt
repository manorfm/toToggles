package com.totoggle.client.refresh

import java.time.Duration
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

/** A cancellable scheduled refresh. */
fun interface ScheduledRefresh {
    fun cancel()
}

/**
 * Schedules the next catalogue refresh. The narrow interface keeps the client refresh policy
 * deterministic under test and prevents framework-specific scheduling concerns leaking into the
 * SDK's HTTP or cache layers.
 */
interface RefreshScheduler : AutoCloseable {
    fun schedule(task: () -> Unit, delay: Duration): ScheduledRefresh

    override fun close()
}

/** The production scheduler. One daemon thread is owned by one ToToggle client instance. */
internal class ExecutorRefreshScheduler(applicationName: String) : RefreshScheduler {
    private val executor: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor { runnable ->
        Thread(runnable, "ToToggle-Refresh-$applicationName").apply { isDaemon = true }
    }

    override fun schedule(task: () -> Unit, delay: Duration): ScheduledRefresh {
        val future = executor.schedule(task, delay.toMillis().coerceAtLeast(1), TimeUnit.MILLISECONDS)
        return ScheduledRefresh { future.cancel(false) }
    }

    override fun close() {
        executor.shutdown()
        if (!executor.awaitTermination(5, TimeUnit.SECONDS)) {
            executor.shutdownNow()
        }
    }
}
