package com.totoggle.client.context

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.entry
import org.junit.jupiter.api.Test

class NetworkContextTest {
    @Test fun `ignores spoofed forwarded values from untrusted peers`() {
        assertThat(NetworkContext.values(NetworkRequest("10.0.0.8", null, "203.0.113.4", "BR")))
            .containsEntry("ip", "10.0.0.8")
            .doesNotContainKey("country")
    }
    @Test fun `uses trusted forwarded values and normalizes country`() {
        assertThat(NetworkContext.values(NetworkRequest("10.0.0.8", null, "203.0.113.4, 10.0.0.8", "br"), NetworkContextOptions(trustedProxyRanges = listOf("10.0.0.8"))))
            .containsEntry("ip", "203.0.113.4")
            .containsEntry("country", "BR")
    }

    @Test fun `uses Forwarded IPv6 only when the remote peer belongs to a trusted CIDR`() {
        val values = NetworkContext.values(
            NetworkRequest("2001:db8:1::10", "for=\"[2001:db8:ffff::42]\";proto=https", null, "br"),
            NetworkContextOptions(trustedProxyRanges = listOf("2001:db8:1::/64")),
        )

        assertThat(values).containsEntry("ip", "2001:db8:ffff:0:0:0:0:42").containsEntry("country", "BR")
    }

    @Test fun `ignores RFC 7239 data when the remote peer is outside trusted ranges`() {
        val values = NetworkContext.values(
            NetworkRequest("198.51.100.10", "for=203.0.113.4", "203.0.113.4", "BR"),
            NetworkContextOptions(trustedProxyRanges = listOf("10.0.0.0/8")),
        )

        assertThat(values).containsOnly(entry("ip", "198.51.100.10"))
    }

    @Test fun `uses the first valid client IP from trusted Forwarded before X-Forwarded-For`() {
        val values = NetworkContext.values(
            NetworkRequest("10.0.0.8", "for=203.0.113.4, for=10.0.0.8", "198.51.100.4", null),
            NetworkContextOptions(trustedProxyRanges = listOf("10.0.0.8")),
        )

        assertThat(values).containsOnly(entry("ip", "203.0.113.4"))
    }

    @Test fun `falls back to remote IP when forwarded addresses are malformed or obfuscated`() {
        val values = NetworkContext.values(
            NetworkRequest("10.0.0.8", "for=_hidden", "not-an-ip", null),
            NetworkContextOptions(trustedProxyRanges = listOf("10.0.0.0/8")),
        )

        assertThat(values).containsOnly(entry("ip", "10.0.0.8"))
    }

    @Test fun `supports IPv4 trusted proxy CIDRs`() {
        val values = NetworkContext.values(
            NetworkRequest("10.12.0.8", null, "203.0.113.4, 10.12.0.8", "us"),
            NetworkContextOptions(trustedProxyRanges = listOf("10.12.0.0/16")),
        )

        assertThat(values).containsEntry("ip", "203.0.113.4").containsEntry("country", "US")
    }

    @Test fun `uses local GeoIP for the effective direct client IP`() {
        val values = NetworkContext.values(
            NetworkRequest("203.0.113.4", null, null, null),
            NetworkContextOptions(countryResolver = CountryResolver { ip -> if (ip == "203.0.113.4") "br" else null }),
        )

        assertThat(values).containsEntry("ip", "203.0.113.4").containsEntry("country", "BR")
    }

    @Test fun `uses local GeoIP for the effective IP forwarded by a trusted proxy`() {
        val values = NetworkContext.values(
            NetworkRequest("10.0.0.8", null, "203.0.113.4", null),
            NetworkContextOptions(
                trustedProxyRanges = listOf("10.0.0.8"),
                countryResolver = CountryResolver { ip -> if (ip == "203.0.113.4") "PT" else null },
            ),
        )

        assertThat(values).containsEntry("ip", "203.0.113.4").containsEntry("country", "PT")
    }

    @Test fun `uses a valid trusted edge country header before local GeoIP`() {
        val values = NetworkContext.values(
            NetworkRequest("10.0.0.8", null, "203.0.113.4", "br"),
            NetworkContextOptions(
                trustedProxyRanges = listOf("10.0.0.8"),
                countryResolver = CountryResolver { "PT" },
            ),
        )

        assertThat(values).containsEntry("country", "BR")
    }

    @Test fun `falls back to local GeoIP when a trusted edge header is malformed`() {
        val values = NetworkContext.values(
            NetworkRequest("10.0.0.8", null, "203.0.113.4", "Brazil"),
            NetworkContextOptions(
                trustedProxyRanges = listOf("10.0.0.8"),
                countryResolver = CountryResolver { "pt" },
            ),
        )

        assertThat(values).containsEntry("country", "PT")
    }

    @Test fun `fails closed when country sources are disabled or invalid`() {
        val disabled = NetworkContext.values(NetworkRequest("203.0.113.4", null, null, "BR"))
        val invalid = NetworkContext.values(
            NetworkRequest("203.0.113.4", null, null, null),
            NetworkContextOptions(countryResolver = CountryResolver { "Brazil" }),
        )

        assertThat(disabled).doesNotContainKey("country")
        assertThat(invalid).doesNotContainKey("country")
    }

    @Test fun `fails closed when the local GeoIP resolver throws`() {
        val values = NetworkContext.values(
            NetworkRequest("203.0.113.4", null, null, null),
            NetworkContextOptions(countryResolver = CountryResolver { error("GeoIP unavailable") }),
        )

        assertThat(values).containsOnly(entry("ip", "203.0.113.4"))
    }
}
