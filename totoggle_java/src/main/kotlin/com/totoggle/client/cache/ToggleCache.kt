package com.totoggle.client.cache

import com.totoggle.client.model.Application
import com.totoggle.client.model.ServerResponse
import com.totoggle.client.model.Toggle
import org.slf4j.LoggerFactory
import java.time.Instant
import java.util.concurrent.locks.ReentrantReadWriteLock
import kotlin.concurrent.read
import kotlin.concurrent.write

/**
 * Thread-safe cache for storing toggle data.
 * Provides quick access to toggle information and maintains data freshness.
 */
class ToggleCache {
    
    private val logger = LoggerFactory.getLogger(ToggleCache::class.java)
    private val lock = ReentrantReadWriteLock()
    
    @Volatile
    private var cachedApplication: Application? = null
    
    @Volatile
    private var lastUpdateTime: Instant? = null
    
    @Volatile
    private var togglesByPath: Map<String, Toggle> = emptyMap()
    
    /**
     * Updates the cache with new data from the server.
     * 
     * @param response The server response containing application and toggles
     */
    fun updateCache(response: ServerResponse) {
        lock.write {
            try {
                cachedApplication = response.application
                lastUpdateTime = Instant.now()
                
                // Build a quick lookup map for toggles by path
                togglesByPath = response.application.toggles.associateBy { it.path }
                
                logger.info("Cache updated with {} toggles from application: {}", 
                    response.application.toggles.size,
                    response.application.name)
                
                if (logger.isDebugEnabled) {
                    val paths = response.application.toggles.map { it.path }.sorted()
                    logger.debug("Cached toggle paths: {}", paths)
                }
                
            } catch (e: Exception) {
                logger.error("Error updating cache", e)
                throw e
            }
        }
    }
    
    /**
     * Gets a toggle by its path.
     * 
     * @param path The toggle path
     * @return The toggle if found, null otherwise
     */
    fun getToggle(path: String): Toggle? {
        return lock.read {
            togglesByPath[path]
        }
    }
    
    /**
     * Gets all toggles that are ancestors of the given path.
     * 
     * @param path The toggle path
     * @return List of ancestor toggles in hierarchical order
     */
    fun getAncestors(path: String): List<Toggle> {
        return lock.read {
            cachedApplication?.getAncestorsOf(path) ?: emptyList()
        }
    }
    
    /**
     * Gets all cached toggles.
     * 
     * @return List of all toggles
     */
    fun getAllToggles(): List<Toggle> {
        return lock.read {
            cachedApplication?.toggles ?: emptyList()
        }
    }
    
    /**
     * Gets the cached application data.
     * 
     * @return The cached application, null if not available
     */
    fun getApplication(): Application? {
        return lock.read {
            cachedApplication
        }
    }
    
    /**
     * Gets the time when the cache was last updated.
     * 
     * @return The last update time, null if never updated
     */
    fun getLastUpdateTime(): Instant? {
        return lock.read {
            lastUpdateTime
        }
    }
    
    /**
     * Checks if the cache has data.
     * 
     * @return true if cache has data, false otherwise
     */
    fun hasData(): Boolean {
        return lock.read {
            cachedApplication != null
        }
    }
    
    /**
     * Checks if a toggle exists in the cache.
     * 
     * @param path The toggle path
     * @return true if the toggle exists, false otherwise
     */
    fun hasToggle(path: String): Boolean {
        return lock.read {
            togglesByPath.containsKey(path)
        }
    }
    
    /**
     * Gets cache statistics for monitoring and debugging.
     * 
     * @return Cache statistics
     */
    fun getStats(): CacheStats {
        return lock.read {
            CacheStats(
                toggleCount = togglesByPath.size,
                lastUpdateTime = lastUpdateTime,
                applicationName = cachedApplication?.name,
                hasData = cachedApplication != null
            )
        }
    }
    
    /**
     * Clears the cache.
     */
    fun clear() {
        lock.write {
            cachedApplication = null
            lastUpdateTime = null
            togglesByPath = emptyMap()
            logger.info("Cache cleared")
        }
    }
}

/**
 * Cache statistics for monitoring.
 */
data class CacheStats(
    val toggleCount: Int,
    val lastUpdateTime: Instant?,
    val applicationName: String?,
    val hasData: Boolean
)