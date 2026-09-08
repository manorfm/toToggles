package com.totoggle.client.context

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.entry
import org.junit.jupiter.api.Test

class NetworkContextTest {
    @Test fun `ignores spoofed forwarded values from untrusted peers`() {
        assertThat(NetworkContext.values("10.0.0.8", emptyList(), null, "203.0.113.4", "BR")).containsEntry("ip", "10.0.0.8").doesNotContainKey("country")
    }
    @Test fun `uses trusted forwarded values and normalizes country`() {
        assertThat(NetworkContext.values("10.0.0.8", listOf("10.0.0.8"), null, "203.0.113.4, 10.0.0.8", "br")).containsEntry("ip", "203.0.113.4").containsEntry("country", "BR")
    }

    @Test fun `uses Forwarded IPv6 only when the remote peer belongs to a trusted CIDR`() {
        val values = NetworkContext.values(
            remoteIp = "2001:db8:1::10",
            trustedProxyRanges = listOf("2001:db8:1::/64"),
            forwarded = "for=\"[2001:db8:ffff::42]\";proto=https",
            forwardedFor = null,
            country = "br",
        )

        assertThat(values).containsEntry("ip", "2001:db8:ffff:0:0:0:0:42").containsEntry("country", "BR")
    }

    @Test fun `ignores RFC 7239 data when the remote peer is outside trusted ranges`() {
        val values = NetworkContext.values(
            remoteIp = "198.51.100.10",
            trustedProxyRanges = listOf("10.0.0.0/8"),
            forwarded = "for=203.0.113.4",
            forwardedFor = "203.0.113.4",
            country = "BR",
        )

        assertThat(values).containsOnly(entry("ip", "198.51.100.10"))
    }

    @Test fun `uses the first valid client IP from trusted Forwarded before X-Forwarded-For`() {
        val values = NetworkContext.values(
            remoteIp = "10.0.0.8",
            trustedProxyRanges = listOf("10.0.0.8"),
            forwarded = "for=203.0.113.4, for=10.0.0.8",
            forwardedFor = "198.51.100.4",
            country = null,
        )

        assertThat(values).containsOnly(entry("ip", "203.0.113.4"))
    }

    @Test fun `falls back to remote IP when forwarded addresses are malformed or obfuscated`() {
        val values = NetworkContext.values(
            remoteIp = "10.0.0.8",
            trustedProxyRanges = listOf("10.0.0.0/8"),
            forwarded = "for=_hidden",
            forwardedFor = "not-an-ip",
            country = null,
        )

        assertThat(values).containsOnly(entry("ip", "10.0.0.8"))
    }

    @Test fun `supports IPv4 trusted proxy CIDRs`() {
        val values = NetworkContext.values(
            remoteIp = "10.12.0.8",
            trustedProxyRanges = listOf("10.12.0.0/16"),
            forwarded = null,
            forwardedFor = "203.0.113.4, 10.12.0.8",
            country = "us",
        )

        assertThat(values).containsEntry("ip", "203.0.113.4").containsEntry("country", "US")
    }
}
