package setup

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.KotlinModule
import com.fasterxml.jackson.module.kotlin.readValue
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.nio.file.Files
import java.nio.file.attribute.PosixFilePermission
import java.util.*

/**
 * Setup class for creating test data for stress testing.
 * Creates applications, secret keys, and toggles for performance testing.
 */
object TestDataSetup {
    private val cookieJar = mutableMapOf<String, String>()
    private val client = OkHttpClient.Builder()
        .cookieJar(object : okhttp3.CookieJar {
            override fun saveFromResponse(url: okhttp3.HttpUrl, cookies: List<okhttp3.Cookie>) {
                cookies.forEach { cookie ->
                    cookieJar[cookie.name] = cookie.value
                }
            }
            override fun loadForRequest(url: okhttp3.HttpUrl): List<okhttp3.Cookie> {
                return cookieJar.map { (name, value) ->
                    okhttp3.Cookie.Builder()
                        .name(name)
                        .value(value)
                        .domain(url.host)
                        .build()
                }.toList()
            }
        })
        .build()
    private val objectMapper = ObjectMapper().registerModule(KotlinModule.Builder().build())
    private val baseUrl = System.getProperty("server.url", "http://localhost:3056")
    private val mediaType = "application/json; charset=utf-8".toMediaType()
    
    data class Application(
        val name: String,
        val secretKey: String,
        val toggles: List<Toggle>
    )
    
    data class Toggle(
        val path: String,
        val enabled: Boolean,
        val level: Int,
        val hasActivationRule: Boolean,
        val activationRule: ActivationRule?
    )
    
    data class ActivationRule(
        val type: String,
        val value: String,
        val contextKey: String
    )

    private data class TeamsResponse(val teams: List<TeamResponse>)
    private data class TeamResponse(val id: String)
    private data class ApplicationResponse(val id: String)
    private data class SecretResponse(@JsonProperty("plain_key") val plainKey: String)
    private data class AuthenticationResponse(val success: Boolean)
    private data class ToggleResponse(val id: String, val path: String)
    
    @JvmStatic
    fun main(args: Array<String>) {
        println("🚀 Starting test data setup for ToToggle stress testing...")
        
        try {
            val applications = createApplications()
            saveTestData(applications)
            println("✅ Test data setup completed successfully!")
            println("📊 Created:")
            println("   - ${applications.size} applications")
            println("   - ${applications.sumOf { it.toggles.size }} total toggles")
            println("   - Test data saved to test-data.json")
            
        } catch (_: Exception) {
            println("❌ Stress test data setup failed")
            throw IllegalStateException("stress test data setup failed")
        }
    }
    
    private fun createApplications(): List<Application> {
        val applications = mutableListOf<Application>()
        val toggles = stressToggleCatalogue()
        
        for (i in 1..5) {
            val appName = "stress-test-app-${i.toString().padStart(2, '0')}"
            
            println("Creating application: $appName with ${toggles.size} toggles")
            
            val realSecretKey = createApplicationInServer(appName, toggles)
            applications.add(Application(appName, realSecretKey, toggles))
            println("    ✅ Application '$appName' added to test data")
        }
        
        return applications
    }

    /** The catalogue behind sdk-stress-scenarios.json. Keep it deterministic so a failed
     * evaluation identifies an SDK/context regression instead of random fixture drift. */
    internal fun stressToggleCatalogue(): List<Toggle> = listOf(
        Toggle("stress.no-rule", true, 2, false, null),
        Toggle("stress.local-rule", true, 2, true, ActivationRule("attribute", "pro", "attributes.plan")),
        Toggle("stress.parent-disabled", false, 2, false, null),
        Toggle("stress.parent-disabled.child", true, 3, false, null),
        Toggle("stress.country-rule", true, 2, true, ActivationRule("country", "BR", "country")),
        Toggle("stress.ipv4-rule", true, 2, true, ActivationRule("ip", "203.0.113.0/24", "ip")),
        Toggle("stress.ipv6-rule", true, 2, true, ActivationRule("ip", "2001:db8::/32", "ip")),
    )
    
    private fun createApplicationInServer(appName: String, toggles: List<Toggle>): String {
        println("  → Creating application '$appName' in server...")
        
        try {
            // First, authenticate (sets cookies automatically)
            check(authenticateWithServer()) { "authentication failed" }
            
            // Get user teams first to get a team_id
            val teamsRequest = Request.Builder()
                .url("$baseUrl/api/profile/teams")
                .build()
                
            val teamId = client.newCall(teamsRequest).execute().use { teamsResponse ->
                if (!teamsResponse.isSuccessful) {
                    println("    ⚠️  Failed to get teams: ${teamsResponse.code}")
                    throw IllegalStateException("unable to load teams")
                }
                
                val teams = objectMapper.readValue<TeamsResponse>(teamsResponse.bodyText()).teams
                
                if (teams.isEmpty()) {
                    println("    ⚠️  No teams available")
                    throw IllegalStateException("no teams available")
                }
                
                teams.first().id
            }
            
            // Create application (cookies are sent automatically)
            val createAppBody = mapOf(
                "name" to appName,
                "team_id" to teamId
            )
            val createAppRequest = Request.Builder()
                .url("$baseUrl/api/applications")
                .post(objectMapper.writeValueAsString(createAppBody).toRequestBody(mediaType))
                .build()
                
            client.newCall(createAppRequest).execute().use { response ->
                if (!response.isSuccessful) {
                    println("    ⚠️  Failed to create application: ${response.code}")
                    throw IllegalStateException("unable to create application")
                }
                
                val appId = objectMapper.readValue<ApplicationResponse>(response.bodyText()).id
                
                println("    ✅ Application created with ID: $appId")
                
                // Generate secret key for the application
                val generateSecretRequest = Request.Builder()
                    .url("$baseUrl/api/applications/$appId/generate-secret")
                    .post("{}".toRequestBody(mediaType))
                    .build()
                    
                client.newCall(generateSecretRequest).execute().use { secretResponse ->
                    if (!secretResponse.isSuccessful) {
                        println("    ⚠️  Failed to generate secret key: ${secretResponse.code}")
                        throw IllegalStateException("unable to generate application secret")
                    }
                    
                    val plainKey = objectMapper.readValue<SecretResponse>(secretResponse.bodyText()).plainKey
                    
                    println("    🔑 Secret key generated and stored in the owner-only local fixture")
                    
                    createTogglesInServer(appId, toggles)
                    
                    return plainKey
                }
            }
        } catch (error: Exception) {
            println("    ❌ Error creating application")
            throw IllegalStateException("failed to create stress application", error)
        }
    }
    
    private fun authenticateWithServer(): Boolean {
        try {
            val (username, password) = setupCredentials()
            val credentials = mapOf(
                "username" to username,
                "password" to password
            )
            
            val request = Request.Builder()
                .url("$baseUrl/api/auth/login")
                .post(objectMapper.writeValueAsString(credentials).toRequestBody(mediaType))
                .build()
                
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    println("    ⚠️  Authentication failed: ${response.code}")
                    return false
                }
                
                val authData = objectMapper.readValue<AuthenticationResponse>(response.bodyText())
                
                if (authData.success) {
                    println("    ✅ Authentication successful, cookie saved")
                    return true
                } else {
                    println("    ⚠️  Authentication failed")
                    return false
                }
            }
        } catch (_: Exception) {
            println("    ❌ Authentication error")
            return false
        }
    }
    
    private fun createTogglesInServer(appId: String, toggles: List<Toggle>) {
        toggles.forEach { toggle ->
            val request = Request.Builder()
                .url("$baseUrl/api/applications/$appId/toggles")
                .post(objectMapper.writeValueAsString(mapOf("toggle" to toggle.path)).toRequestBody(mediaType))
                .build()
            client.newCall(request).execute().use { response ->
                check(response.isSuccessful) { "unable to create toggle ${toggle.path}" }
            }
        }

        val toggleIDs = fetchToggleIDs(appId)
        toggles.forEach { toggle ->
            val toggleID = requireNotNull(toggleIDs[toggle.path]) {
                "created toggle ${toggle.path} was not returned by the server"
            }
            val body = mutableMapOf<String, Any>(
                "enabled" to toggle.enabled,
                "has_activation_rule" to toggle.hasActivationRule,
            )
            toggle.activationRule?.let { rule ->
                body["activation_rule"] = mapOf(
                    "type" to rule.type,
                    "value" to rule.value,
                    "config" to mapOf("context_key" to rule.contextKey),
                )
            }
            val request = Request.Builder()
                .url("$baseUrl/api/applications/$appId/toggles/$toggleID")
                .put(objectMapper.writeValueAsString(body).toRequestBody(mediaType))
                .build()
            client.newCall(request).execute().use { response ->
                check(response.isSuccessful) { "unable to configure toggle ${toggle.path}" }
            }
        }
    }

    private fun fetchToggleIDs(appId: String): Map<String, String> {
        val request = Request.Builder().url("$baseUrl/api/applications/$appId/toggles").build()
        return client.newCall(request).execute().use { response ->
            check(response.isSuccessful) { "unable to fetch stress toggles" }
            objectMapper.readValue<List<ToggleResponse>>(response.bodyText())
                .associate { it.path to it.id }
        }
    }
    
    private fun saveTestData(applications: List<Application>) {
        val testDataFile = File("test-data.json")
        val testData = mapOf(
            "applications" to applications,
            "metadata" to mapOf(
                "created" to Date().toString(),
                "totalApplications" to applications.size,
                "totalToggles" to applications.sumOf { it.toggles.size },
                "serverUrl" to baseUrl
            )
        )
        
        writeOwnerOnly(testDataFile, objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(testData))
        
        // Also create a simplified file for Gatling scenarios
        val gatlingData = applications.map { app ->
            mapOf(
                "name" to app.name,
                "secretKey" to app.secretKey,
                "togglePaths" to app.toggles.map { it.path }
            )
        }
        
        writeOwnerOnly(File("gatling-test-data.json"),
            objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(gatlingData)
        )
    }

    internal fun setupCredentials(environment: Map<String, String> = System.getenv()): Pair<String, String> {
        val username = environment["STRESS_SETUP_USERNAME"]?.trim().orEmpty()
        val password = environment["STRESS_SETUP_PASSWORD"]?.trim().orEmpty()
        check(username.isNotEmpty() && password.isNotEmpty()) {
            "STRESS_SETUP_USERNAME and STRESS_SETUP_PASSWORD are required"
        }
        return username to password
    }

    private fun writeOwnerOnly(file: File, content: String) {
        file.writeText(content)
        runCatching {
            Files.setPosixFilePermissions(file.toPath(), setOf(
                PosixFilePermission.OWNER_READ,
                PosixFilePermission.OWNER_WRITE,
            ))
        }
    }

    private fun Response.bodyText(): String = requireNotNull(body?.string()) {
        "server response body was empty"
    }
}
