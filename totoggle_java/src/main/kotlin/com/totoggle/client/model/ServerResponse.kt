package com.totoggle.client.model

import com.fasterxml.jackson.annotation.JsonProperty

/**
 * Represents the response from the ToToggle server API.
 * 
 * @property application The application data with its toggles
 */
data class ServerResponse(
    @JsonProperty("application")
    val application: Application
)