package com.totoggle.client.model

import com.fasterxml.jackson.annotation.JsonProperty

/**
 * Represents an application with its toggles.
 * 
 * @property id Unique identifier for the application
 * @property name Display name of the application
 * @property toggles List of toggles belonging to this application
 */
data class Application(
    @JsonProperty("id")
    val id: String,
    
    @JsonProperty("name")
    val name: String,
    
    @JsonProperty("toggles")
    val toggles: List<Toggle>
) {
    
    /**
     * Finds a toggle by its exact path.
     */
    fun findToggleByPath(path: String): Toggle? {
        return toggles.find { it.path == path }
    }
    
    /**
     * Gets all toggles that are ancestors of the given path.
     * Returns toggles in hierarchical order (root first).
     */
    fun getAncestorsOf(path: String): List<Toggle> {
        val segments = path.split(".")
        val ancestorPaths = mutableListOf<String>()
        
        // Build ancestor paths: for "user.payments.view-table"
        // we get ["user", "user.payments"]
        for (i in 1 until segments.size) {
            ancestorPaths.add(segments.take(i).joinToString("."))
        }
        
        return ancestorPaths.mapNotNull { findToggleByPath(it) }
            .sortedBy { it.level }
    }
    
    /**
     * Gets all toggles that are children of the given path.
     */
    fun getChildrenOf(path: String): List<Toggle> {
        return toggles.filter { it.isChildOf(path) }
            .sortedBy { it.level }
    }
    
    /**
     * Gets the root level toggles (level 0).
     */
    fun getRootToggles(): List<Toggle> {
        return toggles.filter { it.level == 0 }
    }
}