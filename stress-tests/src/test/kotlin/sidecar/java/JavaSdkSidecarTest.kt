package sidecar.java

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.Duration
import java.util.concurrent.TimeUnit

class JavaSdkSidecarTest {
    private val mapper = jacksonObjectMapper()
    private val httpClient = OkHttpClient()
    private lateinit var catalogueServer: MockWebServer
    private lateinit var sidecar: JavaSdkSidecar

    @BeforeEach
    fun setUp() {
        catalogueServer = MockWebServer()
        catalogueServer.start()
        catalogueServer.enqueue(
            MockResponse()
                .setHeader("Content-Type", "application/json")
                .setBody(catalogueWithContextualRules()),
        )
        sidecar = JavaSdkSidecar(
            JavaSdkSidecarConfig(
                serverUrl = catalogueServer.url("/").toString(),
                secretKey = "sk_stress_test",
                bindHost = "127.0.0.1",
                port = 0,
            ),
        )
        sidecar.start()
    }

    @AfterEach
    fun tearDown() {
        if (::sidecar.isInitialized) sidecar.close()
        if (::catalogueServer.isInitialized) catalogueServer.shutdown()
    }

    @Test
    fun `evaluates authenticated context through the real Java SDK`() {
        val result = evaluate(
            path = "member.only",
            context = mapOf("userId" to "member-42", "rolloutKey" to "stable-42"),
        )

        assertThat(result.code).isEqualTo(200)
        assertThat(result.body).isEqualTo(mapOf("active" to true))
        assertThat(catalogueServer.takeRequest(1, TimeUnit.SECONDS)?.getHeader("X-API-Key"))
            .isEqualTo("sk_stress_test")
    }

    @Test
    fun `uses loopback-trusted forwarding headers for IP rules`() {
        val request = Request.Builder()
            .url("http://127.0.0.1:${sidecar.port}/evaluate")
            .header("Forwarded", "for=10.24.3.8")
            .post(mapper.writeValueAsBytes(mapOf("path" to "network.allowed", "context" to emptyMap<String, Any>()))
                .toRequestBody(JSON))
            .build()

        httpClient.newCall(request).execute().use { response ->
            assertThat(response.code).isEqualTo(200)
            assertThat(mapper.readValue<Map<String, Boolean>>(response.body!!.bytes())).isEqualTo(mapOf("active" to true))
        }
    }

    @Test
    fun `rejects malformed input without echoing supplied context`() {
        val secret = "do-not-return-this-context"
        val request = Request.Builder()
            .url("http://127.0.0.1:${sidecar.port}/evaluate")
            .post("{\"path\":\"member.only\",\"context\":{\"attributes\":\"$secret\"}}".toRequestBody(JSON))
            .build()

        httpClient.newCall(request).execute().use { response ->
            val body = response.body!!.string()
            assertThat(response.code).isEqualTo(400)
            assertThat(body).doesNotContain(secret)
            assertThat(body).isEqualTo("{\"error\":\"invalid request\"}")
        }
    }

    @Test
    fun `reports health without exposing catalog details`() {
        val request = Request.Builder()
            .url("http://127.0.0.1:${sidecar.port}/health")
            .build()

        httpClient.newCall(request).execute().use { response ->
            assertThat(response.code).isEqualTo(200)
            assertThat(response.body!!.string()).isEqualTo("{\"status\":\"ok\"}")
        }
    }

    @Test
    fun `requires explicit server URL and secret and limits binding to loopback`() {
        assertThatThrownBy { JavaSdkSidecarConfig.fromEnvironment(emptyMap()) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("STRESS_SERVER_URL")
        assertThatThrownBy {
            JavaSdkSidecarConfig(
                serverUrl = "http://localhost:3056",
                secretKey = "sk_stress_test",
                bindHost = "0.0.0.0",
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
        assertThatThrownBy {
            JavaSdkSidecarConfig(
                serverUrl = "http://credentials@localhost:3056",
                secretKey = "sk_stress_test",
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun `requires acknowledgement before targeting a remote catalogue`() {
        assertThatThrownBy {
            JavaSdkSidecarConfig(
                serverUrl = "https://stress.example.test",
                secretKey = "sk_stress_test",
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("non-loopback")

        assertThat(JavaSdkSidecarConfig.fromEnvironment(mapOf(
            "STRESS_SERVER_URL" to "https://stress.example.test",
            "STRESS_SECRET_KEY" to "sk_stress_test",
            "ALLOW_NON_LOOPBACK_STRESS_TARGETS" to "yes",
        )).serverUrl).isEqualTo("https://stress.example.test")
    }

    @Test
    fun `rejects malformed numeric sidecar configuration`() {
        assertThatThrownBy {
            JavaSdkSidecarConfig.fromEnvironment(mapOf(
                "STRESS_SERVER_URL" to "http://127.0.0.1:3056",
                "STRESS_SECRET_KEY" to "sk_stress_test",
                "STRESS_JAVA_SIDECAR_PORT" to "invalid",
            ))
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("STRESS_JAVA_SIDECAR_PORT")
    }

    @Test
    fun `refreshes the catalogue during a stress run`() {
        assertThat(JavaSdkSidecar.STRESS_REFRESH_INTERVAL).isEqualTo(Duration.ofSeconds(5))
    }

    private fun evaluate(path: String, context: Map<String, String>): HttpResult {
        val request = Request.Builder()
            .url("http://127.0.0.1:${sidecar.port}/evaluate")
            .post(mapper.writeValueAsBytes(mapOf("path" to path, "context" to context)).toRequestBody(JSON))
            .build()
        return httpClient.newCall(request).execute().use { response ->
            HttpResult(response.code, mapper.readValue(response.body!!.bytes()))
        }
    }

    private data class HttpResult(val code: Int, val body: Map<String, Boolean>)

    private fun catalogueWithContextualRules(): String =
        """{"application":{"id":"stress-app","name":"stress-app","revision":"r1","toggles":[
            {"id":"member-only","path":"member.only","value":"only","enabled":true,"level":1,"parent_id":null,"app_id":"stress-app","has_activation_rule":true,"activation_rule":{"type":"user_id","value":"member-42","config":{"context_key":"user_id"}}},
            {"id":"network-allowed","path":"network.allowed","value":"allowed","enabled":true,"level":1,"parent_id":null,"app_id":"stress-app","has_activation_rule":true,"activation_rule":{"type":"ip","value":"10.0.0.0/8","config":{"context_key":"ip"}}}
        ]}}""".trimIndent()

    private companion object {
        val JSON = "application/json".toMediaType()
    }
}
