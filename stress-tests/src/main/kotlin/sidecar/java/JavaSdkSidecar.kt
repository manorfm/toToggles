package sidecar.java

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.module.kotlin.KotlinModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import com.totoggle.client.ToToggleClient
import com.totoggle.client.config.ToToggleConfig
import com.totoggle.client.context.NetworkContextOptions
import com.totoggle.client.context.RequestContextResolver
import com.totoggle.client.context.ToggleRequestContext
import com.totoggle.client.context.http.AuthenticatedToggleContextExtractor
import com.totoggle.client.context.http.HttpRequestContextAdapter
import com.totoggle.client.context.http.HttpRequestMetadata
import com.totoggle.client.context.http.HttpRequestMetadataExtractor
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.URI
import java.time.Duration
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Loopback-only HTTP process used by Gatling to exercise the published Java SDK under load.
 *
 * It deliberately exposes a narrow test protocol and never logs request context or credentials.
 * `context` represents already-authenticated application values; `Forwarded`, `X-Forwarded-For`,
 * and `CF-IPCountry` exercise the SDK's trusted-proxy adapter path.
 */
class JavaSdkSidecar(private val config: JavaSdkSidecarConfig) : AutoCloseable {
    private val resolver = RequestContextResolver()
    private val client = ToToggleClient(
        ToToggleConfig.builder()
            .applicationName("totoggle-stress-java-sidecar")
            .serverUrl(config.serverUrl)
            .secretKey(config.secretKey)
            .refreshInterval(STRESS_REFRESH_INTERVAL)
            .refreshBackoffMax(STRESS_REFRESH_INTERVAL)
            .enableOfflineMode(false)
            .contextResolver(resolver)
            .build(),
    )
    private val requestContextAdapter = HttpRequestContextAdapter(
        resolver = resolver,
        metadataExtractor = HttpRequestMetadataExtractor<StressEvaluationRequest> { request ->
            HttpRequestMetadata(
                remoteIp = request.exchange.remoteAddress.address.hostAddress,
                forwarded = request.exchange.requestHeaders.getFirst("Forwarded"),
                forwardedFor = request.exchange.requestHeaders.getFirst("X-Forwarded-For"),
                trustedCountryHeader = request.exchange.requestHeaders.getFirst("CF-IPCountry"),
            )
        },
        authenticatedContextExtractor = AuthenticatedToggleContextExtractor<StressEvaluationRequest> { request -> request.context },
        // The runner only accepts local Gatling traffic. In that test boundary it can model a
        // trusted proxy forwarding a synthetic client address and country.
        networkOptions = NetworkContextOptions(trustedProxyRanges = LOOPBACK_PROXY_RANGES),
    )
    private val executor: ExecutorService = Executors.newFixedThreadPool(config.workerThreads)
    private val closed = AtomicBoolean(false)
    private val stopped = CountDownLatch(1)
    private var server: HttpServer? = null

    val port: Int
        get() = server?.address?.port ?: error("Java SDK sidecar has not been started")

    fun start() {
        check(server == null) { "Java SDK sidecar has already been started" }
        try {
            client.start()
            check(client.isHealthy()) {
                "Java SDK sidecar could not fetch an initial toggle catalogue"
            }

            val address = InetSocketAddress(config.bindHost, config.port)
            server = HttpServer.create(address, 0).also { httpServer ->
                httpServer.executor = executor
                httpServer.createContext("/evaluate", ::evaluate)
                httpServer.createContext("/health", ::health)
                httpServer.start()
            }
        } catch (exception: Exception) {
            close()
            throw exception
        }
    }

    fun awaitTermination() {
        stopped.await()
    }

    override fun close() {
        if (!closed.compareAndSet(false, true)) return
        server?.stop(0)
        executor.shutdown()
        executor.awaitTermination(SHUTDOWN_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        executor.shutdownNow()
        client.shutdown()
        stopped.countDown()
    }

    private fun evaluate(exchange: HttpExchange) {
        try {
            if (!exchange.remoteAddress.address.isLoopbackAddress) {
                exchange.respond(403, INVALID_REQUEST_RESPONSE)
                return
            }
            if (exchange.requestMethod != "POST") {
                exchange.respond(405, INVALID_REQUEST_RESPONSE)
                return
            }
            if (!exchange.requestHeaders.getFirst("Content-Type").isJsonContentType()) {
                exchange.respond(415, INVALID_REQUEST_RESPONSE)
                return
            }

            val request = exchange.parseEvaluationRequest()
            val active = requestContextAdapter.withRequest(request) {
                client.isActive(request.path)
            }
            exchange.respond(200, if (active) ACTIVE_RESPONSE else INACTIVE_RESPONSE)
        } catch (_: InvalidStressRequestException) {
            exchange.respond(400, INVALID_REQUEST_RESPONSE)
        } catch (_: Exception) {
            // The sidecar must never surface a request value or an SDK exception to Gatling.
            exchange.respond(500, INTERNAL_ERROR_RESPONSE)
        } finally {
            exchange.close()
        }
    }

    private fun health(exchange: HttpExchange) {
        try {
            if (exchange.requestMethod != "GET") {
                exchange.respond(405, INVALID_REQUEST_RESPONSE)
            } else if (closed.get() || !client.isHealthy()) {
                exchange.respond(503, INVALID_REQUEST_RESPONSE)
            } else {
                exchange.respond(200, HEALTH_RESPONSE)
            }
        } finally {
            exchange.close()
        }
    }

    private fun HttpExchange.parseEvaluationRequest(): StressEvaluationRequest {
        val body = requestBody.use { input -> input.readNBytes(MAX_REQUEST_BYTES + 1) }
        if (body.size > MAX_REQUEST_BYTES) throw InvalidStressRequestException()
        val root = runCatching { JSON.readTree(body) }.getOrNull() ?: throw InvalidStressRequestException()
        if (!root.isObject || root.fieldNames().asSequence().toSet() != REQUEST_FIELDS) throw InvalidStressRequestException()

        val path = root.requiredText("path", MAX_PATH_LENGTH)
        if (!TOGGLE_PATH.matches(path)) throw InvalidStressRequestException()
        val context = root.get("context") ?: throw InvalidStressRequestException()
        return StressEvaluationRequest(this, path, context.parseContext())
    }

    private fun JsonNode.parseContext(): ToggleRequestContext {
        if (!isObject || fieldNames().asSequence().any { it !in CONTEXT_FIELDS }) throw InvalidStressRequestException()
        val attributes = get("attributes")?.let { attributeNode ->
            if (!attributeNode.isObject || attributeNode.size() > MAX_ATTRIBUTES) throw InvalidStressRequestException()
            attributeNode.fields().asSequence().associate { (name, value) ->
                if (!ATTRIBUTE_NAME.matches(name) || !value.isTextual || value.textValue().length > MAX_CONTEXT_VALUE_LENGTH) {
                    throw InvalidStressRequestException()
                }
                name to value.textValue()
            }
        } ?: emptyMap()
        return ToggleRequestContext(
            userId = optionalText("userId"),
            rolloutKey = optionalText("rolloutKey"),
            cohort = optionalText("cohort"),
            attributes = attributes,
        )
    }

    private fun JsonNode.optionalText(field: String): String? {
        val node = get(field) ?: return null
        if (!node.isTextual || node.textValue().length > MAX_CONTEXT_VALUE_LENGTH) throw InvalidStressRequestException()
        return node.textValue()
    }

    private fun JsonNode.requiredText(field: String, maximumLength: Int): String {
        val node = get(field) ?: throw InvalidStressRequestException()
        if (!node.isTextual || node.textValue().length !in 1..maximumLength) throw InvalidStressRequestException()
        return node.textValue()
    }

    private fun HttpExchange.respond(status: Int, body: ByteArray) {
        responseHeaders.set("Content-Type", "application/json; charset=utf-8")
        responseHeaders.set("Cache-Control", "no-store")
        sendResponseHeaders(status, body.size.toLong())
        responseBody.use { it.write(body) }
    }

    private fun String?.isJsonContentType(): Boolean =
        this?.substringBefore(';')?.trim()?.equals("application/json", ignoreCase = true) == true

    private class InvalidStressRequestException : RuntimeException()

    private data class StressEvaluationRequest(
        val exchange: HttpExchange,
        val path: String,
        val context: ToggleRequestContext,
    )

    companion object {
        internal val STRESS_REFRESH_INTERVAL: Duration = Duration.ofSeconds(5)
        val JSON = jacksonObjectMapper().registerModule(KotlinModule.Builder().build())
        val LOOPBACK_PROXY_RANGES = listOf("127.0.0.1/32", "::1/128")
        val REQUEST_FIELDS = setOf("path", "context")
        val CONTEXT_FIELDS = setOf("userId", "rolloutKey", "cohort", "attributes")
        val TOGGLE_PATH = Regex("[A-Za-z0-9][A-Za-z0-9._-]*")
        val ATTRIBUTE_NAME = Regex("[A-Za-z0-9][A-Za-z0-9_-]*")
        const val MAX_REQUEST_BYTES = 16 * 1024
        const val MAX_PATH_LENGTH = 256
        const val MAX_CONTEXT_VALUE_LENGTH = 256
        const val MAX_ATTRIBUTES = 32
        const val SHUTDOWN_TIMEOUT_SECONDS = 5L
        val ACTIVE_RESPONSE = "{\"active\":true}".toByteArray()
        val INACTIVE_RESPONSE = "{\"active\":false}".toByteArray()
        val INVALID_REQUEST_RESPONSE = "{\"error\":\"invalid request\"}".toByteArray()
        val INTERNAL_ERROR_RESPONSE = "{\"error\":\"internal error\"}".toByteArray()
        val HEALTH_RESPONSE = "{\"status\":\"ok\"}".toByteArray()
    }
}

/** Runtime configuration supplied only by explicit stress-test environment variables. */
data class JavaSdkSidecarConfig(
    val serverUrl: String,
    val secretKey: String,
    val bindHost: String = "127.0.0.1",
    val port: Int = 19093,
    val workerThreads: Int = 8,
    val allowNonLoopbackTarget: Boolean = false,
) {
    init {
        require(serverUrl.isSafeHttpUrl()) { "STRESS_SERVER_URL must be an absolute HTTP(S) URL without credentials" }
        require(allowNonLoopbackTarget || serverUrl.isLoopbackHttpUrl()) {
            "STRESS_SERVER_URL must not target a non-loopback host unless ALLOW_NON_LOOPBACK_STRESS_TARGETS=yes"
        }
        require(secretKey.isNotBlank()) { "STRESS_SECRET_KEY must be set" }
        require(secretKey.startsWith("sk_")) { "STRESS_SECRET_KEY must be a secret key" }
        require(port in 0..65535) { "STRESS_JAVA_SIDECAR_PORT must be between 0 and 65535" }
        require(workerThreads in 1..64) { "STRESS_JAVA_SIDECAR_WORKERS must be between 1 and 64" }
        val addresses = runCatching { InetAddress.getAllByName(bindHost).toList() }.getOrNull()
        require(!addresses.isNullOrEmpty() && addresses.all(InetAddress::isLoopbackAddress)) {
            "STRESS_JAVA_SIDECAR_HOST must resolve only to loopback addresses"
        }
    }

    companion object {
        fun fromEnvironment(environment: Map<String, String> = System.getenv()): JavaSdkSidecarConfig = JavaSdkSidecarConfig(
            serverUrl = environment["STRESS_SERVER_URL"] ?: "",
            secretKey = environment["STRESS_SECRET_KEY"] ?: "",
            bindHost = environment["STRESS_JAVA_SIDECAR_HOST"] ?: "127.0.0.1",
            port = environmentInt(environment, "STRESS_JAVA_SIDECAR_PORT", 19093),
            workerThreads = environmentInt(environment, "STRESS_JAVA_SIDECAR_WORKERS", 8),
            allowNonLoopbackTarget = environment["ALLOW_NON_LOOPBACK_STRESS_TARGETS"] == "yes",
        )

        private fun environmentInt(environment: Map<String, String>, name: String, defaultValue: Int): Int {
            val value = environment[name]?.trim().orEmpty()
            if (value.isEmpty()) return defaultValue
            return value.toIntOrNull() ?: throw IllegalArgumentException("$name must be a number")
        }
    }
}

private fun String.isSafeHttpUrl(): Boolean = runCatching {
    URI(this).let { uri ->
        uri.scheme in setOf("http", "https") &&
            !uri.host.isNullOrBlank() &&
            uri.userInfo == null &&
            uri.query == null &&
            uri.fragment == null
    }
}.getOrDefault(false)

private fun String.isLoopbackHttpUrl(): Boolean = runCatching {
    URI(this).host in setOf("localhost", "127.0.0.1", "::1")
}.getOrDefault(false)

/** Entrypoint for Gatling scripts; it intentionally prints no credentials or context. */
object JavaSdkSidecarMain {
    @JvmStatic
    fun main(args: Array<String>) {
        val sidecar = JavaSdkSidecar(JavaSdkSidecarConfig.fromEnvironment())
        Runtime.getRuntime().addShutdownHook(Thread(sidecar::close, "totoggle-stress-java-sidecar-shutdown"))
        sidecar.start()
        println("Java SDK stress sidecar listening on 127.0.0.1:${sidecar.port}")
        sidecar.awaitTermination()
    }
}
