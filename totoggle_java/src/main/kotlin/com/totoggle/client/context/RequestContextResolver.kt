package com.totoggle.client.context

/** Thread-bound resolver for servlet-style request middleware. Always use [withValues] so the
 * context is restored after a request; it is intentionally unsuitable for reactive execution. */
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
