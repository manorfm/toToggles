package com.totoggle.client.strategy

import com.totoggle.client.model.ActivationRule
import org.slf4j.LoggerFactory

/**
 * Strategy for evaluating IP-address-based activation rules.
 * The rule value is a comma-separated allowlist of exact IPv4 addresses and/or CIDR ranges
 * (confirmed hint: "Comma-separated IPs or CIDR ranges", e.g. "10.0.0.0/24"); the caller passes
 * the current request's IP address as the `parameter`.
 *
 * IPv4 only — the confirmed placeholder ("10.0.0.0/24") and hint only ever show IPv4 examples,
 * so this deliberately doesn't take on IPv6 CIDR matching without a confirmed spec for it.
 * Parses addresses by hand (not `InetAddress.getByName`) so a malformed candidate can never
 * trigger an accidental DNS lookup during rule evaluation.
 */
class IpStrategy : ActivationStrategy {

    private val logger = LoggerFactory.getLogger(IpStrategy::class.java)

    override fun evaluate(rule: ActivationRule): Boolean {
        logger.debug("IP strategy called without an IP address, returning false")
        return false
    }

    override fun evaluate(rule: ActivationRule, parameter: String?): Boolean {
        if (parameter == null) return false
        if (rule.value.isBlank()) return false

        val candidate = parseIpv4(parameter)
        if (candidate == null) {
            logger.warn("IP strategy: could not parse candidate IP '{}'", parameter)
            return false
        }

        val result = rule.value.split(",").map { it.trim() }.any { matchesEntry(it, candidate) }
        logger.debug("IP strategy: rule='${rule.value}', ip='$parameter', result=$result")
        return result
    }

    private fun matchesEntry(entry: String, candidate: IntArray): Boolean {
        if (entry.isBlank()) return false
        if ("/" in entry) {
            val parts = entry.split("/", limit = 2)
            val network = parseIpv4(parts[0]) ?: return false
            val prefixLength = parts[1].trim().toIntOrNull() ?: return false
            if (prefixLength !in 0..32) return false
            return isInCidrRange(candidate, network, prefixLength)
        }
        val exact = parseIpv4(entry) ?: return false
        return candidate.contentEquals(exact)
    }

    private fun isInCidrRange(candidate: IntArray, network: IntArray, prefixLength: Int): Boolean {
        val fullOctets = prefixLength / 8
        val remainingBits = prefixLength % 8

        for (i in 0 until fullOctets) {
            if (candidate[i] != network[i]) return false
        }
        if (remainingBits > 0) {
            val mask = (0xFF shl (8 - remainingBits)) and 0xFF
            if ((candidate[fullOctets] and mask) != (network[fullOctets] and mask)) return false
        }
        return true
    }

    /** Parses a dotted-quad IPv4 literal into 4 octets (0-255), or null if it isn't one. */
    private fun parseIpv4(value: String): IntArray? {
        val parts = value.trim().split(".")
        if (parts.size != 4) return null
        val octets = IntArray(4)
        for (i in 0 until 4) {
            val octet = parts[i].toIntOrNull() ?: return null
            if (octet !in 0..255) return null
            octets[i] = octet
        }
        return octets
    }

    override fun getRuleType(): String = ActivationRule.TYPE_IP
}
