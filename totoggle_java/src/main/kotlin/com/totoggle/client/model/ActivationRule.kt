package com.totoggle.client.model

import com.fasterxml.jackson.annotation.JsonProperty

/**
 * Represents an activation rule for a toggle.
 * Activation rules determine additional conditions that must be met
 * for a toggle to be considered active beyond just being enabled.
 * 
 * @property type The type of activation rule (e.g., "percentage", "parameter", "user_id")
 * @property value The value/configuration for the rule (e.g., "25" for percentage, "premium" for parameter)
 */
data class ActivationRule(
    @JsonProperty("type")
    val type: String,
    
    @JsonProperty("value")
    val value: String
) {
    
    companion object {
        const val TYPE_PERCENTAGE = "percentage"
        const val TYPE_PARAMETER = "parameter"
        const val TYPE_USER_ID = "user_id"
        const val TYPE_IP_ADDRESS = "ip_address"
        const val TYPE_COUNTRY = "country"
        const val TYPE_TIME = "time"
        
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
}