package com.totoggle.client.context.http

import com.totoggle.client.context.NetworkContext
import com.totoggle.client.context.NetworkContextOptions
import com.totoggle.client.context.NetworkContextValues
import com.totoggle.client.context.NetworkRequest
import com.totoggle.client.context.RequestContextResolver
import com.totoggle.client.context.ToggleRequestContext

/**
 * Minimal HTTP metadata copied by a framework boundary before toggle evaluation begins.
 *
 * This deliberately contains only socket and selected forwarding headers. Authentication belongs
 * to [AuthenticatedToggleContextExtractor], so a transport header can never become `user_id`, an
 * attribute, or any other application-owned context value.
 */
data class HttpRequestMetadata(
    val remoteIp: String?,
    val forwarded: String? = null,
    val forwardedFor: String? = null,
    val trustedCountryHeader: String? = null,
) {
    internal fun asNetworkRequest(): NetworkRequest = NetworkRequest(
        remoteIp = remoteIp,
        forwarded = forwarded,
        forwardedFor = forwardedFor,
        trustedCountryHeader = trustedCountryHeader,
    )
}

/** Extracts transport metadata from a framework-specific request object. */
fun interface HttpRequestMetadataExtractor<Request> {
    fun extract(request: Request): HttpRequestMetadata
}

/**
 * Extracts application-owned values from verified framework authentication state.
 *
 * Returning `null`, or throwing an [Exception], deliberately produces an empty application
 * context so contextual rules fail closed. Implementations must not read identity or attributes
 * directly from request headers, query parameters, or request bodies.
 */
fun interface AuthenticatedToggleContextExtractor<Request> {
    fun extract(request: Request): ToggleRequestContext?
}

/**
 * Framework-neutral request adapter for synchronous HTTP filters and interceptors.
 *
 * It keeps the SDK free of Servlet, Spring, or JAX-RS dependencies. A framework integration
 * supplies two small extractors and wraps its downstream handler with [withRequest]. The adapter
 * copies only the required request values, applies [NetworkContext] with the explicit proxy trust
 * policy, and restores the ThreadLocal scope even when the downstream handler throws.
 *
 * This adapter is intentionally synchronous and thread-bound. Do not use it for reactive,
 * coroutine, asynchronous Servlet, or executor-hopped handlers.
 */
class HttpRequestContextAdapter<Request>(
    private val resolver: RequestContextResolver,
    private val metadataExtractor: HttpRequestMetadataExtractor<Request>,
    private val authenticatedContextExtractor: AuthenticatedToggleContextExtractor<Request>,
    private val networkOptions: NetworkContextOptions = NetworkContextOptions(),
) {
    /**
     * Runs [downstream] in the request context for [request].
     *
     * Extraction failures intentionally leave their relevant values absent. The downstream
     * exception itself is not intercepted and is propagated after scope cleanup.
     */
    fun <T> withRequest(request: Request, downstream: () -> T): T = resolver.withContext(
        context = applicationContext(request),
        networkValues = networkValues(request),
        block = downstream,
    )

    private fun applicationContext(request: Request): ToggleRequestContext = try {
        authenticatedContextExtractor.extract(request) ?: ToggleRequestContext()
    } catch (_: Exception) {
        ToggleRequestContext()
    }

    private fun networkValues(request: Request): NetworkContextValues = try {
        NetworkContext.values(metadataExtractor.extract(request).asNetworkRequest(), networkOptions)
    } catch (_: Exception) {
        NetworkContextValues.empty()
    }
}
