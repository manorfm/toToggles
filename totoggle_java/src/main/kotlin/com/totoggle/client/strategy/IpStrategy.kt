package com.totoggle.client.strategy

import com.totoggle.client.model.ActivationRule
import org.slf4j.LoggerFactory

/**
 * Evaluates a comma-separated allowlist of exact IPv4/IPv6 addresses and CIDR ranges. Address
 * parsing is local and strict: it never calls name resolution, and malformed candidates or
 * entries fail closed. IPv6 zone identifiers are deliberately rejected because they are
 * interface-local rather than portable request addresses.
 */
class IpStrategy : ActivationStrategy {

    private val logger = LoggerFactory.getLogger(IpStrategy::class.java)

    override fun evaluate(rule: ActivationRule): Boolean {
        logger.debug("IP strategy called without an IP address, returning false")
        return false
    }

    override fun evaluate(rule: ActivationRule, contextValue: String?): Boolean {
        if (contextValue == null || rule.value.isBlank()) return false
        val candidate = parseIp(contextValue) ?: return false
        val result = rule.value.split(",").map { it.trim() }.any { matchesEntry(it, candidate) }
        logger.debug("IP strategy evaluated: result={}", result)
        return result
    }

    private fun matchesEntry(entry: String, candidate: IpAddress): Boolean {
        if (entry.isBlank()) return false
        if ("/" in entry) {
            val parts = entry.split("/", limit = 3)
            if (parts.size != 2 || !parts[1].trim().matches(Regex("\\d+"))) return false
            val network = parseIp(parts[0]) ?: return false
            val prefixLength = parts[1].trim().toIntOrNull() ?: return false
            val maximumPrefix = if (network.bytes.size == IPV4_BYTES) 32 else 128
            return prefixLength in 0..maximumPrefix && isInCidrRange(candidate, network, prefixLength)
        }
        val exact = parseIp(entry) ?: return false
        return candidate.bytes.contentEquals(exact.bytes)
    }

    private fun isInCidrRange(candidate: IpAddress, network: IpAddress, prefixLength: Int): Boolean {
        if (candidate.bytes.size != network.bytes.size) return false
        val fullBytes = prefixLength / 8
        val remainingBits = prefixLength % 8
        for (index in 0 until fullBytes) {
            if (candidate.bytes[index] != network.bytes[index]) return false
        }
        if (remainingBits == 0) return true
        val mask = (0xFF shl (8 - remainingBits)) and 0xFF
        return (candidate.bytes[fullBytes].toInt() and mask) == (network.bytes[fullBytes].toInt() and mask)
    }

    private fun parseIp(value: String): IpAddress? =
        parseIpv4(value)?.let(::IpAddress) ?: parseIpv6(value)?.let(::IpAddress)

    /** Parses a dotted-quad IPv4 literal into four bytes, or null. */
    private fun parseIpv4(value: String): ByteArray? {
        val parts = value.trim().split(".")
        if (parts.size != IPV4_BYTES) return null
        val bytes = ByteArray(IPV4_BYTES)
        for (index in parts.indices) {
            if (!parts[index].matches(Regex("\\d+"))) return null
            val octet = parts[index].toIntOrNull() ?: return null
            if (octet !in 0..255) return null
            bytes[index] = octet.toByte()
        }
        return bytes
    }

    /** Parses an RFC 4291 IPv6 literal, including a final embedded IPv4 literal, without DNS. */
    private fun parseIpv6(value: String): ByteArray? {
        val input = value.trim()
        if (input.isEmpty() || "%" in input || Regex("::").findAll(input).count() > 1) return null
        val compressed = "::" in input
        val parts = input.split("::", limit = 2)
        val left = parseIpv6Side(parts[0]) ?: return null
        val right = if (compressed) parseIpv6Side(parts.getOrElse(1) { "" }) ?: return null else emptyList()
        val omitted = IPV6_GROUPS - left.size - right.size
        if ((compressed && omitted < 1) || (!compressed && left.size != IPV6_GROUPS)) return null
        val groups = if (compressed) left + List(omitted) { 0 } + right else left
        if (groups.size != IPV6_GROUPS) return null

        return ByteArray(IPV6_BYTES).also { bytes ->
            groups.forEachIndexed { index, group ->
                bytes[index * 2] = (group ushr 8).toByte()
                bytes[index * 2 + 1] = group.toByte()
            }
        }
    }

    private fun parseIpv6Side(side: String): List<Int>? {
        if (side.isEmpty()) return emptyList()
        val groups = side.split(":")
        return buildList {
            groups.forEachIndexed { index, group ->
                if (group.contains(".")) {
                    if (index != groups.lastIndex) return null
                    val ipv4 = parseIpv4(group) ?: return null
                    add(((ipv4[0].toInt() and 0xFF) shl 8) or (ipv4[1].toInt() and 0xFF))
                    add(((ipv4[2].toInt() and 0xFF) shl 8) or (ipv4[3].toInt() and 0xFF))
                } else {
                    if (!group.matches(Regex("[0-9a-fA-F]{1,4}"))) return null
                    add(group.toIntOrNull(16) ?: return null)
                }
            }
        }
    }

    private data class IpAddress(val bytes: ByteArray)

    override fun getRuleType(): String = ActivationRule.TYPE_IP

    private companion object {
        const val IPV4_BYTES = 4
        const val IPV6_BYTES = 16
        const val IPV6_GROUPS = 8
    }
}
