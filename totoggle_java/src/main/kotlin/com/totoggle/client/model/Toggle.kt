package com.totoggle.client.model

import com.fasterxml.jackson.annotation.JsonProperty

/**
 * Represents a feature toggle with its configuration and activation rules.
 * 
 * @property id Unique identifier for the toggle
 * @property path Full path of the toggle (e.g., "user.payments.view-table")
 * @property value The value/name of this specific toggle level
 * @property enabled Whether the toggle is enabled
 * @property level The hierarchical level (0 for root, 1 for child, etc.)
 * @property parentId ID of the parent toggle, null for root toggles
 * @property appId Application ID this toggle belongs to
 * @property hasActivationRule Whether this toggle has activation rules
 * @property activationRule The activation rule configuration. Nullable: the real public
 *   `GET /api/toggles` endpoint (server/internal/app/handler/secret_key_handler.go) serializes
 *   this as JSON `null` whenever `hasActivationRule` is false (the field is a Go `*ActivationRule`
 *   pointer, `omitempty`) — confirmed in docs/rest-flow.md's own documented example response.
 *   A non-nullable type here made Jackson's kotlin-module throw MissingKotlinParameterException
 *   on every toggle without a rule, i.e. the common case — breaking `fetchToggles()` for almost
 *   any real application.
 */
data class Toggle(
    @JsonProperty("id")
    val id: String,
    
    @JsonProperty("path")
    val path: String,
    
    @JsonProperty("value")
    val value: String,
    
    @JsonProperty("enabled")
    val enabled: Boolean,
    
    @JsonProperty("level")
    val level: Int,
    
    @JsonProperty("parent_id")
    val parentId: String?,
    
    @JsonProperty("app_id")
    val appId: String,
    
    @JsonProperty("has_activation_rule")
    val hasActivationRule: Boolean,
    
    @JsonProperty("activation_rule")
    val activationRule: ActivationRule? = null
) {
    
    /**
     * Gets the path segments as a list.
     * For example: "user.payments.view-table" becomes ["user", "payments", "view-table"]
     */
    fun getPathSegments(): List<String> = path.split(".")
    
    /**
     * Gets the parent path by removing the last segment.
     * For example: "user.payments.view-table" becomes "user.payments"
     * Returns null for root level toggles.
     */
    fun getParentPath(): String? {
        val segments = getPathSegments()
        return if (segments.size > 1) {
            segments.dropLast(1).joinToString(".")
        } else {
            null
        }
    }
    
    /**
     * Checks if this toggle is a child of the given path.
     */
    fun isChildOf(parentPath: String): Boolean {
        return path.startsWith("$parentPath.") && path != parentPath
    }
    
    /**
     * Checks if this toggle is an ancestor of the given path.
     */
    fun isAncestorOf(childPath: String): Boolean {
        return childPath.startsWith("$path.") && childPath != path
    }
}