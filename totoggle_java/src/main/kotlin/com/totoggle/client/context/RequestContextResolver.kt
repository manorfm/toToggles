package com.totoggle.client.context

/**
 * Thread-bound resolver for Servlet filters and synchronous MVC interceptors.
 *
 * Populate it around the filter chain with [withContext]. The scope is restored even if the
 * chain throws, preventing values from leaking into a reused servlet worker thread. This resolver
 * is unsuitable for reactive or coroutine execution that changes threads.
 */
class RequestContextResolver : ToggleContextResolver {
    private val values = ThreadLocal<Map<String, String>?>()

    override fun resolve(contextKey: String): String? = values.get()?.get(contextKey)

    /**
     * Opens a request scope for synchronous MVC interceptors. Close it from `afterCompletion` on
     * the same request thread. Servlet filters should prefer [withContext], which closes it in a
     * `finally` block automatically.
     */
    fun openContext(
        context: ToggleRequestContext,
        networkValues: NetworkContextValues = NetworkContextValues.empty(),
    ): RequestContextScope {
        val previous = values.get()
        val current = context.values(networkValues)
        values.set(current)
        return RequestContextScope(Thread.currentThread(), previous, current)
    }

    /**
     * Runs [block] with canonical application values and the trusted `ip`/`country` network
     * values extracted by [NetworkContext]. Other network map keys are ignored by
     * [ToggleRequestContext], so transport data cannot impersonate an authenticated principal.
     */
    fun <T> withContext(
        context: ToggleRequestContext,
        networkValues: NetworkContextValues = NetworkContextValues.empty(),
        block: () -> T,
    ): T = openContext(context, networkValues).use { block() }

    /** A closeable scope that enforces LIFO cleanup on its owning request thread. */
    inner class RequestContextScope internal constructor(
        private val owner: Thread,
        private val previous: Map<String, String>?,
        private val current: Map<String, String>,
    ) : AutoCloseable {
        private var closed = false

        override fun close() {
            if (closed) return
            check(Thread.currentThread() === owner) { "Request context scope must close on its owning thread" }
            check(values.get() === current) { "Request context scopes must close in LIFO order" }
            if (previous == null) values.remove() else values.set(previous)
            closed = true
        }
    }
}
