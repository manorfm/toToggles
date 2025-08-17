package com.totoggle.client.cache

import com.totoggle.client.model.ActivationRule
import com.totoggle.client.model.Application
import com.totoggle.client.model.ServerResponse
import com.totoggle.client.model.Toggle
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.Instant

class ToggleCacheTest {
    
    private lateinit var cache: ToggleCache
    
    @BeforeEach
    fun setUp() {
        cache = ToggleCache()
    }
    
    @Test
    fun `should start with empty cache`() {
        assertThat(cache.hasData()).isFalse()
        assertThat(cache.getLastUpdateTime()).isNull()
        assertThat(cache.getApplication()).isNull()
        assertThat(cache.getAllToggles()).isEmpty()
    }
    
    @Test
    fun `should update cache with server response`() {
        val toggles = listOf(
            createToggle(path = "user", level = 0),
            createToggle(path = "user.payments", level = 1),
            createToggle(path = "user.payments.view-table", level = 2)
        )
        val app = Application("app-id", "Test App", toggles)
        val response = ServerResponse(app)
        
        val beforeUpdate = Instant.now()
        cache.updateCache(response)
        val afterUpdate = Instant.now()
        
        assertThat(cache.hasData()).isTrue()
        assertThat(cache.getLastUpdateTime()).isBetween(beforeUpdate, afterUpdate)
        assertThat(cache.getApplication()).isEqualTo(app)
        assertThat(cache.getAllToggles()).hasSize(3)
    }
    
    @Test
    fun `should find toggle by path`() {
        val toggles = listOf(
            createToggle(path = "user"),
            createToggle(path = "user.payments"),
            createToggle(path = "user.payments.view-table")
        )
        val app = Application("app-id", "Test App", toggles)
        val response = ServerResponse(app)
        cache.updateCache(response)
        
        val found = cache.getToggle("user.payments")
        val notFound = cache.getToggle("nonexistent")
        
        assertThat(found).isNotNull
        assertThat(found?.path).isEqualTo("user.payments")
        assertThat(notFound).isNull()
    }
    
    @Test
    fun `should check if toggle exists`() {
        val toggles = listOf(createToggle(path = "user.payments"))
        val app = Application("app-id", "Test App", toggles)
        val response = ServerResponse(app)
        cache.updateCache(response)
        
        assertThat(cache.hasToggle("user.payments")).isTrue()
        assertThat(cache.hasToggle("nonexistent")).isFalse()
    }
    
    @Test
    fun `should get ancestors`() {
        val toggles = listOf(
            createToggle(path = "user", level = 0),
            createToggle(path = "user.payments", level = 1),
            createToggle(path = "user.payments.view-table", level = 2),
            createToggle(path = "admin", level = 0)
        )
        val app = Application("app-id", "Test App", toggles)
        val response = ServerResponse(app)
        cache.updateCache(response)
        
        val ancestors = cache.getAncestors("user.payments.view-table")
        
        assertThat(ancestors).hasSize(2)
        assertThat(ancestors[0].path).isEqualTo("user")
        assertThat(ancestors[1].path).isEqualTo("user.payments")
    }
    
    @Test
    fun `should return cache stats`() {
        val toggles = listOf(
            createToggle(path = "user"),
            createToggle(path = "admin")
        )
        val app = Application("app-id", "Test App", toggles)
        val response = ServerResponse(app)
        cache.updateCache(response)
        
        val stats = cache.getStats()
        
        assertThat(stats.toggleCount).isEqualTo(2)
        assertThat(stats.applicationName).isEqualTo("Test App")
        assertThat(stats.hasData).isTrue()
        assertThat(stats.lastUpdateTime).isNotNull()
    }
    
    @Test
    fun `should clear cache`() {
        val toggles = listOf(createToggle(path = "user"))
        val app = Application("app-id", "Test App", toggles)
        val response = ServerResponse(app)
        cache.updateCache(response)
        
        assertThat(cache.hasData()).isTrue()
        
        cache.clear()
        
        assertThat(cache.hasData()).isFalse()
        assertThat(cache.getLastUpdateTime()).isNull()
        assertThat(cache.getApplication()).isNull()
        assertThat(cache.getAllToggles()).isEmpty()
    }
    
    @Test
    fun `should be thread safe`() {
        val toggles = listOf(createToggle(path = "user"))
        val app = Application("app-id", "Test App", toggles)
        val response = ServerResponse(app)
        
        // Simulate concurrent access
        val threads = (1..10).map { threadId ->
            Thread {
                repeat(100) {
                    cache.updateCache(response)
                    cache.getToggle("user")
                    cache.hasToggle("user")
                    cache.getStats()
                }
            }
        }
        
        threads.forEach { it.start() }
        threads.forEach { it.join() }
        
        // Should not throw any exceptions and maintain data integrity
        assertThat(cache.hasData()).isTrue()
        assertThat(cache.getStats().toggleCount).isEqualTo(1)
    }
    
    private fun createToggle(
        id: String = "test-id",
        path: String = "test.path",
        value: String = path.split(".").last(),
        enabled: Boolean = true,
        level: Int = 0,
        parentId: String? = null,
        appId: String = "app-id",
        hasActivationRule: Boolean = false,
        activationRule: ActivationRule = ActivationRule.empty()
    ) = Toggle(
        id = id,
        path = path,
        value = value,
        enabled = enabled,
        level = level,
        parentId = parentId,
        appId = appId,
        hasActivationRule = hasActivationRule,
        activationRule = activationRule
    )
}