package com.totoggle.client.context

/** Request/deployment information required by contextual activation rules. */
data class ToggleContext(
    val rolloutKey: String? = null,
    val parameter: String? = null,
    val userId: String? = null,
    val ip: String? = null,
    val country: String? = null,
    val cohort: String? = null,
    val attributes: Map<String, String> = emptyMap()
)

/**
 * Application-owned bridge from its middleware/request context to ToToggle. The SDK cannot and
 * must not infer headers, proxy IPs, or authentication data by itself. Throwing from this
 * provider is caught by isActive(), logged, and evaluated as false.
 */
fun interface ToggleContextProvider {
    fun getContext(): ToggleContext?
}
