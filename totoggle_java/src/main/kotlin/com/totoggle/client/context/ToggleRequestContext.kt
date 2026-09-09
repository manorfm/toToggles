package com.totoggle.client.context

/**
 * Application-owned values for one feature-toggle evaluation scope.
 *
 * Populate [userId] only from the authenticated principal. [rolloutKey] must be a stable,
 * non-secret identifier when percentage rules are used; it is deliberately not synthesized from
 * a request ID. Attribute names are supplied without the `attributes.` prefix.
 */
data class ToggleRequestContext(
    val userId: String? = null,
    val rolloutKey: String? = null,
    val cohort: String? = null,
    val attributes: Map<String, String> = emptyMap(),
) {
    internal fun values(networkValues: NetworkContextValues): Map<String, String> = buildMap {
        networkValues[IP_CONTEXT_KEY]?.normalized()?.let { put(IP_CONTEXT_KEY, it) }
        networkValues[COUNTRY_CONTEXT_KEY]?.normalized()?.let { put(COUNTRY_CONTEXT_KEY, it) }
        userId.normalized()?.let { put(USER_ID_CONTEXT_KEY, it) }
        rolloutKey.normalized()?.let { put(ROLLOUT_KEY_CONTEXT_KEY, it) }
        cohort.normalized()?.let { put(COHORT_CONTEXT_KEY, it) }
        attributes.forEach { (name, value) ->
            name.normalized()?.let { attributeName ->
                value.normalized()?.let { put("$ATTRIBUTE_PREFIX$attributeName", it) }
            }
        }
    }

    private fun String?.normalized(): String? = this?.trim()?.takeIf(String::isNotEmpty)

    private companion object {
        const val IP_CONTEXT_KEY = "ip"
        const val COUNTRY_CONTEXT_KEY = "country"
        const val USER_ID_CONTEXT_KEY = "user_id"
        const val ROLLOUT_KEY_CONTEXT_KEY = "rollout_key"
        const val COHORT_CONTEXT_KEY = "cohort"
        const val ATTRIBUTE_PREFIX = "attributes."
    }
}
