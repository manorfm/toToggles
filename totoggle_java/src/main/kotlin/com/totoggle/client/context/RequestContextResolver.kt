package com.totoggle.client.context

/** Thread-bound resolver for servlet filters/interceptors. Populate it around the filter chain
 * with [withValues]; it restores context even when the chain throws. It is unsuitable for
 * reactive execution. */
class RequestContextResolver : ToggleContextResolver {
    private val values = ThreadLocal<Map<String, String>?>()

    override fun resolve(contextKey: String): String? = values.get()?.get(contextKey)

    fun <T> withValues(contextValues: Map<String, String>, block: () -> T): T {
        val previous = values.get()
        values.set(contextValues.filterValues { it.isNotBlank() })
        return try {
            block()
        } finally {
            if (previous == null) values.remove() else values.set(previous)
        }
    }
}
