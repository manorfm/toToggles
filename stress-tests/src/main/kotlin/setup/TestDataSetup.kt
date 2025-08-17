package setup

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.KotlinModule
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.util.*
import kotlin.random.Random

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
        val value: String
    )
    
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
            
        } catch (e: Exception) {
            println("❌ Error during setup: ${e.message}")
            e.printStackTrace()
        }
    }
    
    private fun createApplications(): List<Application> {
        val applications = mutableListOf<Application>()
        
        for (i in 1..5) { // Reduced to 5 apps for faster setup
            val appName = "stress-test-app-${i.toString().padStart(2, '0')}"
            val toggles = createTogglesForApplication(appName)
            
            println("Creating application: $appName with ${toggles.size} toggles")
            
            // Create application in server and get real secret key
            val realSecretKey = createApplicationInServer(appName, "")
            
            if (realSecretKey != null) {
                applications.add(Application(appName, realSecretKey, toggles))
                println("    ✅ Application '$appName' added to test data")
            } else {
                println("    ❌ Failed to create application '$appName', skipping...")
            }
        }
        
        return applications
    }
    
    private fun createTogglesForApplication(appName: String): List<Toggle> {
        val toggles = mutableListOf<Toggle>()
        val random = Random.Default
        
        // Level 1 toggles (root features)
        val rootFeatures = listOf("user", "admin", "payment", "notification", "analytics")
        
        rootFeatures.forEachIndexed { index, feature ->
            if (index < 4) { // Create 4 root features per app
                toggles.add(Toggle(
                    path = feature,
                    enabled = random.nextDouble() > 0.1, // 90% enabled
                    level = 1,
                    hasActivationRule = random.nextDouble() > 0.7, // 30% have rules
                    activationRule = if (random.nextDouble() > 0.7) createRandomActivationRule() else null
                ))
                
                // Level 2 toggles (sub-features)
                val subFeatures = listOf("profile", "settings", "dashboard", "reports")
                subFeatures.forEachIndexed { subIndex, subFeature ->
                    if (subIndex < 3) { // 3 sub-features per root
                        toggles.add(Toggle(
                            path = "$feature.$subFeature",
                            enabled = random.nextDouble() > 0.15, // 85% enabled
                            level = 2,
                            hasActivationRule = random.nextDouble() > 0.6, // 40% have rules
                            activationRule = if (random.nextDouble() > 0.6) createRandomActivationRule() else null
                        ))
                        
                        // Level 3 toggles (detailed features)
                        val detailFeatures = listOf("view", "edit", "export", "import")
                        detailFeatures.forEachIndexed { detailIndex, detailFeature ->
                            if (detailIndex < 2 && toggles.size < 20) { // 2 detail features, max 20 total
                                toggles.add(Toggle(
                                    path = "$feature.$subFeature.$detailFeature",
                                    enabled = random.nextDouble() > 0.2, // 80% enabled
                                    level = 3,
                                    hasActivationRule = random.nextDouble() > 0.5, // 50% have rules
                                    activationRule = if (random.nextDouble() > 0.5) createRandomActivationRule() else null
                                ))
                            }
                        }
                    }
                }
            }
        }
        
        return toggles.take(20) // Ensure max 20 toggles per app
    }
    
    private fun createRandomActivationRule(): ActivationRule {
        val random = Random.Default
        return if (random.nextBoolean()) {
            // Percentage rule
            ActivationRule(
                type = "percentage",
                value = listOf(10, 25, 50, 75, 90).random().toString()
            )
        } else {
            // Parameter rule
            ActivationRule(
                type = "parameter",
                value = listOf("premium", "enterprise", "beta", "alpha", "vip").random()
            )
        }
    }
    
    private fun generateSecretKey(): String {
        val chars = "abcdefghijklmnopqrstuvwxyz0123456789"
        return "sk_test_" + (1..32).map { chars.random() }.joinToString("")
    }
    
    private fun createApplicationInServer(appName: String, secretKey: String): String? {
        println("  → Creating application '$appName' in server...")
        
        try {
            // First, authenticate (sets cookies automatically)
            if (!authenticateWithServer()) return null
            
            // Get user teams first to get a team_id
            val teamsRequest = Request.Builder()
                .url("$baseUrl/profile/teams")
                .build()
                
            val teamId = client.newCall(teamsRequest).execute().use { teamsResponse ->
                if (!teamsResponse.isSuccessful) {
                    println("    ⚠️  Failed to get teams: ${teamsResponse.code}")
                    return null
                }
                
                val teamsBody = teamsResponse.body?.string()
                val teamsData = objectMapper.readValue(teamsBody, Map::class.java) as Map<String, Any>
                val teams = teamsData["teams"] as List<Map<String, Any>>
                
                if (teams.isEmpty()) {
                    println("    ⚠️  No teams available")
                    return null
                }
                
                teams[0]["id"] as String
            }
            
            // Create application (cookies are sent automatically)
            val createAppBody = mapOf(
                "name" to appName,
                "team_id" to teamId
            )
            val createAppRequest = Request.Builder()
                .url("$baseUrl/applications")
                .post(objectMapper.writeValueAsString(createAppBody).toRequestBody(mediaType))
                .build()
                
            client.newCall(createAppRequest).execute().use { response ->
                if (!response.isSuccessful) {
                    println("    ⚠️  Failed to create application: ${response.code} - ${response.body?.string()}")
                    return null
                }
                
                val responseBody = response.body?.string()
                val appData = objectMapper.readValue(responseBody, Map::class.java) as Map<String, Any>
                val appId = appData["id"] as String
                
                println("    ✅ Application created with ID: $appId")
                
                // Generate secret key for the application
                val generateSecretRequest = Request.Builder()
                    .url("$baseUrl/applications/$appId/generate-secret")
                    .post("{}".toRequestBody(mediaType))
                    .build()
                    
                client.newCall(generateSecretRequest).execute().use { secretResponse ->
                    if (!secretResponse.isSuccessful) {
                        println("    ⚠️  Failed to generate secret key: ${secretResponse.code}")
                        return null
                    }
                    
                    val secretResponseBody = secretResponse.body?.string()
                    val secretData = objectMapper.readValue(secretResponseBody, Map::class.java) as Map<String, Any>
                    val plainKey = secretData["plain_key"] as String
                    
                    println("    🔑 Secret key generated: ${plainKey.take(20)}...")
                    
                    // Create some sample toggles
                    createTogglesInServer(appId)
                    
                    return plainKey
                }
            }
        } catch (e: Exception) {
            println("    ❌ Error creating application: ${e.message}")
            return null
        }
    }
    
    private fun authenticateWithServer(): Boolean {
        try {
            // Try to authenticate with default credentials
            val credentials = mapOf(
                "username" to "admin",
                "password" to "123456"
            )
            
            val request = Request.Builder()
                .url("$baseUrl/auth/login")
                .post(objectMapper.writeValueAsString(credentials).toRequestBody(mediaType))
                .build()
                
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    println("    ⚠️  Authentication failed: ${response.code}")
                    return false
                }
                
                val responseBody = response.body?.string()
                val authData = objectMapper.readValue(responseBody, Map::class.java) as Map<String, Any>
                
                if (authData["success"] == true) {
                    println("    ✅ Authentication successful, cookie saved")
                    return true
                } else {
                    println("    ⚠️  Authentication failed: ${authData["error"]}")
                    return false
                }
            }
        } catch (e: Exception) {
            println("    ❌ Authentication error: ${e.message}")
            return false
        }
    }
    
    private fun createTogglesInServer(appId: String) {
        val toggles = listOf("user", "admin", "payment", "notification", "analytics")
        
        toggles.forEach { togglePath ->
            try {
                val toggleBody = mapOf("toggle" to togglePath)
                val request = Request.Builder()
                    .url("$baseUrl/applications/$appId/toggles")
                    .post(objectMapper.writeValueAsString(toggleBody).toRequestBody(mediaType))
                    .build()
                    
                client.newCall(request).execute().use { response ->
                    if (response.isSuccessful) {
                        println("      📝 Created toggle: $togglePath")
                    } else {
                        println("      ⚠️  Failed to create toggle '$togglePath': ${response.code}")
                    }
                }
            } catch (e: Exception) {
                println("      ❌ Error creating toggle '$togglePath': ${e.message}")
            }
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
        
        testDataFile.writeText(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(testData))
        
        // Also create a simplified file for Gatling scenarios
        val gatlingData = applications.map { app ->
            mapOf(
                "name" to app.name,
                "secretKey" to app.secretKey,
                "togglePaths" to app.toggles.map { it.path }
            )
        }
        
        File("gatling-test-data.json").writeText(
            objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(gatlingData)
        )
    }
}