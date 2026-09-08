package com.totoggle.client.context

/** Middleware-backed, lazy lookup for the context key required by a rule. */
fun interface ToggleContextResolver {
    fun resolve(contextKey: String): String?
}
