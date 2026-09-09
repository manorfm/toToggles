package com.totoggle.client.context

/**
 * Validated transport values produced exclusively by [NetworkContext].
 *
 * The constructor is private so application code cannot accidentally pass unvalidated request
 * headers or spoof an IP/country value into a rule evaluation scope.
 */
class NetworkContextValues private constructor(
    private val entriesByKey: Map<String, String>,
) : Map<String, String> by entriesByKey {
    internal companion object {
        fun from(values: Map<String, String>): NetworkContextValues = NetworkContextValues(values.toMap())

        fun empty(): NetworkContextValues = NetworkContextValues(emptyMap())
    }
}
