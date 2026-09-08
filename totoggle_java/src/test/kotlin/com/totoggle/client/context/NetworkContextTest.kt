package com.totoggle.client.context

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class NetworkContextTest {
    @Test fun `ignores spoofed forwarded values from untrusted peers`() {
        assertThat(NetworkContext.values("10.0.0.8", false, "203.0.113.4", "BR")).containsEntry("ip", "10.0.0.8").doesNotContainKey("country")
    }
    @Test fun `uses trusted forwarded values and normalizes country`() {
        assertThat(NetworkContext.values("10.0.0.8", true, "203.0.113.4, 10.0.0.8", "br")).containsEntry("ip", "203.0.113.4").containsEntry("country", "BR")
    }
}
