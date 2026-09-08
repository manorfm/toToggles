package com.totoggle.client.context

/** Safe network values for a framework adapter: forwarded data is used only when trusted. */
object NetworkContext {
    fun values(remoteIp: String?, trustedPeer: Boolean, forwardedFor: String?, country: String?): Map<String, String> {
        val ip = if (trustedPeer) forwardedFor?.substringBefore(',')?.trim()?.takeIf { it.isNotBlank() } ?: remoteIp else remoteIp
        return buildMap {
            if (!ip.isNullOrBlank()) put("ip", ip)
            if (trustedPeer && country?.trim()?.matches(Regex("[A-Za-z]{2}")) == true) put("country", country.trim().uppercase())
        }
    }
}
