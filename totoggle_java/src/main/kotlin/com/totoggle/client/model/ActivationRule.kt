package com.totoggle.client.model

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.JsonNode

/**
 * Represents an activation rule for a toggle.
 * Activation rules determine additional conditions that must be met
 * for a toggle to be considered active beyond just being enabled.
 * 
 * @property type The type of activation rule (e.g., "percentage", "attribute", "user_id")
 * @property value The value/configuration for the rule (e.g., "25" for percentage, "premium" for an attribute)
 */
data class ActivationRule(
    @JsonProperty("type")
    val type: String,
    
    @JsonProperty("value")
    val value: String,

    @JsonProperty("config")
    val config: JsonNode? = null
) {
    
    companion object {
        const val TYPE_PERCENTAGE = "percentage"
        const val TYPE_ATTRIBUTE = "attribute"
        const val TYPE_USER_ID = "user_id"
        const val TYPE_IP = "ip"
        const val TYPE_COUNTRY = "country"
        const val TYPE_TIME = "time"
        const val TYPE_COHORT = "cohort"
        
        /**
         * Creates an empty activation rule (no rule applied).
         */
        fun empty(): ActivationRule = ActivationRule("", "")
    }
    
    /**
     * Checks if this rule is empty (no activation rule configured).
     */
    fun isEmpty(): Boolean = type.isBlank() && value.isBlank()
    
    /**
     * Checks if this rule is valid (has both type and value).
     */
    fun isValid(): Boolean = type.isNotBlank() && value.isNotBlank()

    /**
     * Verifies the canonical type/context-key relationship before SDK code consults a request
     * resolver. The fetched catalogue is treated as untrusted input and invalid pairs fail
     * closed locally even though the server validates them when a rule is saved.
     */
    fun hasCanonicalContextKey(): Boolean {
        if (type == TYPE_TIME) return config == null || config.isNull
        val key = config?.get("context_key")?.takeIf { it.isTextual }?.asText()
            ?.takeIf { it.isNotBlank() } ?: return false
        if (key.startsWith("attributes.")) {
            return key.removePrefix("attributes.").isNotEmpty() &&
                (type == TYPE_PERCENTAGE || type == TYPE_ATTRIBUTE)
        }
        return (type == TYPE_PERCENTAGE && key == "rollout_key") ||
            (type == TYPE_USER_ID && key == "user_id") ||
            (type == TYPE_IP && key == "ip") ||
            (type == TYPE_COUNTRY && key == "country") ||
            (type == TYPE_COHORT && key == "cohort")
    }
}
