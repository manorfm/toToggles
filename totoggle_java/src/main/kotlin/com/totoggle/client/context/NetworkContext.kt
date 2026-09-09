package com.totoggle.client.context

import java.net.InetAddress

/** HTTP values extracted by a framework adapter without retaining the request object. */
data class NetworkRequest(
    val remoteIp: String?,
    val forwarded: String?,
    val forwardedFor: String?,
    /** Country header selected by the framework adapter, for example CF-IPCountry. */
    val trustedCountryHeader: String?,
)

/**
 * Resolves a country from a client IP using a local database or in-process service.
 *
 * Implementations must not perform network I/O on the request path.
 */
fun interface CountryResolver {
    fun resolve(clientIp: String): String?
}

/** Network extraction policy. Omitting [countryResolver] disables local GeoIP lookup. */
data class NetworkContextOptions(
    val trustedProxyRanges: Iterable<String> = emptyList(),
    val countryResolver: CountryResolver? = null,
)

/**
 * Extracts network values for HTTP adapters without trusting client-controlled forwarding headers.
 *
 * A proxy is trusted only when [remoteIp] belongs to an exact IP or CIDR in
 * [trustedProxyRanges]. Invalid addresses and proxy ranges are ignored. This fails closed:
 * forwarded IP and country values are never used for an untrusted remote peer.
 */
object NetworkContext {
    fun values(
        request: NetworkRequest,
        options: NetworkContextOptions = NetworkContextOptions(),
    ): NetworkContextValues {
        val remoteAddress = parseIp(request.remoteIp)
        val trustedPeer = remoteAddress != null && options.trustedProxyRanges
            .mapNotNull(::parseNetwork)
            .any { it.contains(remoteAddress) }

        val clientAddress = if (trustedPeer) {
            firstForwardedAddress(request.forwarded)
                ?: firstForwardedForAddress(request.forwardedFor)
                ?: remoteAddress
        } else {
            remoteAddress
        }

        // A header is trustworthy only when the direct peer is explicitly trusted. A local
        // resolver uses the effective client IP and is safe for direct and proxied requests.
        val country = trustedCountry(trustedPeer, request.trustedCountryHeader)
            ?: clientAddress?.hostAddress?.let { resolveCountry(options.countryResolver, it) }

        return NetworkContextValues.from(buildMap {
            clientAddress?.let { put("ip", it.hostAddress) }
            country?.let { put("country", it) }
        })
    }

    private fun trustedCountry(trustedPeer: Boolean, header: String?): String? =
        header?.takeIf { trustedPeer }?.let(::normalizeCountry)

    private fun resolveCountry(resolver: CountryResolver?, clientIp: String): String? =
        runCatching { resolver?.resolve(clientIp) }
            .getOrNull()
            ?.let(::normalizeCountry)

    private fun normalizeCountry(value: String): String? =
        value.trim().takeIf { it.matches(COUNTRY_CODE) }?.uppercase()

    private fun firstForwardedAddress(header: String?): InetAddress? = header
        ?.split(',')
        ?.firstOrNull()
        ?.let(::forwardedElementAddress)

    private fun forwardedElementAddress(element: String): InetAddress? = element
        .split(';')
        .asSequence()
        .map(String::trim)
        .firstOrNull { it.substringBefore('=').trim().equals("for", ignoreCase = true) }
        ?.substringAfter('=', missingDelimiterValue = "")
        ?.let(::parseForwardedValue)

    private fun firstForwardedForAddress(header: String?): InetAddress? = header
        ?.split(',')
        ?.asSequence()
        ?.map(String::trim)
        ?.mapNotNull(::parseForwardedValue)
        ?.firstOrNull()

    /** RFC 7239 requires IPv6 addresses to be enclosed in brackets. */
    private fun parseForwardedValue(value: String): InetAddress? {
        val trimmed = value.trim()
        val unquoted = trimmed.removeSurrounding("\"")
        if (unquoted.isBlank()) return null

        return when {
            unquoted.startsWith("[") -> {
                val closingBracket = unquoted.indexOf(']')
                if (closingBracket <= 1) return null
                val port = unquoted.substring(closingBracket + 1)
                if (port.isNotEmpty() && !port.matches(Regex(":\\d+"))) return null
                parseIp(unquoted.substring(1, closingBracket))
            }
            unquoted.matches(Regex("\\d+\\.\\d+\\.\\d+\\.\\d+:\\d+")) -> {
                val separator = unquoted.lastIndexOf(':')
                val host = unquoted.substring(0, separator)
                val port = unquoted.substring(separator + 1)
                if (host.isBlank() || !port.matches(Regex("\\d+"))) null else parseIp(host)
            }
            else -> parseIp(unquoted)
        }
    }

    private fun parseNetwork(value: String): IpNetwork? {
        val parts = value.trim().split('/', limit = 2)
        val address = parseIp(parts.firstOrNull()) ?: return null
        val prefix = if (parts.size == 1) address.address.size * BITS_PER_BYTE else parts[1].toIntOrNull() ?: return null
        return IpNetwork(address.address, prefix).takeIf { prefix in 0..(address.address.size * BITS_PER_BYTE) }
    }

    /** Parses literals only; the format checks prevent DNS resolution. */
    private fun parseIp(value: String?): InetAddress? {
        val candidate = value?.trim()?.takeIf(String::isNotEmpty) ?: return null
        parseIpv4(candidate)?.let { return it }
        if (!candidate.contains(':') || !candidate.matches(IPV6_LITERAL)) return null
        return runCatching { InetAddress.getByName(candidate) }.getOrNull()
    }

    private fun parseIpv4(value: String): InetAddress? {
        val octets = value.split('.')
        if (octets.size != IPV4_OCTET_COUNT) return null
        val bytes = octets.map {
            if (it.isBlank() || !it.all(Char::isDigit) || (it.length > 1 && it.startsWith('0'))) return null
            it.toIntOrNull()?.takeIf { number -> number in 0..MAX_IPV4_OCTET }?.toByte() ?: return null
        }.toByteArray()
        return InetAddress.getByAddress(bytes)
    }

    private data class IpNetwork(val address: ByteArray, val prefixLength: Int) {
        fun contains(candidate: InetAddress): Boolean {
            val candidateBytes = candidate.address
            if (candidateBytes.size != address.size) return false

            val fullBytes = prefixLength / BITS_PER_BYTE
            val remainingBits = prefixLength % BITS_PER_BYTE
            if (!address.copyOfRange(0, fullBytes).contentEquals(candidateBytes.copyOfRange(0, fullBytes))) return false
            if (remainingBits == 0) return true

            val mask = (MAX_UNSIGNED_BYTE shl (BITS_PER_BYTE - remainingBits)) and MAX_UNSIGNED_BYTE
            return (address[fullBytes].toInt() and mask) == (candidateBytes[fullBytes].toInt() and mask)
        }
    }

    private val COUNTRY_CODE = Regex("[A-Za-z]{2}")
    private val IPV6_LITERAL = Regex("[0-9A-Fa-f:.]+")
    private const val IPV4_OCTET_COUNT = 4
    private const val MAX_IPV4_OCTET = 255
    private const val BITS_PER_BYTE = 8
    private const val MAX_UNSIGNED_BYTE = 0xff
}
