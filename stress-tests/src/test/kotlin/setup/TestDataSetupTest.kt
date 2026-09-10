package setup

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.io.File

class TestDataSetupTest {
    @Test
    fun `requires explicit setup credentials`() {
        assertThatThrownBy { TestDataSetup.setupCredentials(emptyMap()) }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessage("STRESS_SETUP_USERNAME and STRESS_SETUP_PASSWORD or STRESS_SETUP_PASSWORD_FILE are required")
    }

    @Test
    fun `reads explicit setup credentials without changing their values`() {
        val credentials = TestDataSetup.setupCredentials(mapOf(
            "STRESS_SETUP_USERNAME" to "stress-operator",
            "STRESS_SETUP_PASSWORD" to "test-password",
        ))

        assertThat(credentials.first).isEqualTo("stress-operator")
        assertThat(credentials.second).isEqualTo("test-password")
    }

    @Test
    fun `reads a setup password from an explicit local file`() {
        val credentials = TestDataSetup.setupCredentials(
            environment = mapOf(
                "STRESS_SETUP_USERNAME" to "root",
                "STRESS_SETUP_PASSWORD_FILE" to "/private/tmp/root-password",
            ),
            passwordFileReader = { "bootstrap-password\n" },
        )

        assertThat(credentials).isEqualTo("root" to "bootstrap-password")
    }

    @Test
    fun `rejects ambiguous inline and file setup passwords`() {
        assertThatThrownBy {
            TestDataSetup.setupCredentials(mapOf(
                "STRESS_SETUP_USERNAME" to "root",
                "STRESS_SETUP_PASSWORD" to "inline",
                "STRESS_SETUP_PASSWORD_FILE" to "/private/tmp/root-password",
            ))
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessage("set only one of STRESS_SETUP_PASSWORD or STRESS_SETUP_PASSWORD_FILE")
    }

    @Test
    fun `accepts a login response with authentication metadata`() {
        assertThat(TestDataSetup.loginSucceeded("""{
            "success": true,
            "must_change_password": false,
            "user": {"id": "root-id", "role": "root"}
        }""".trimIndent())).isTrue()
    }

    @Test
    fun `reads the created stress team identifier from the server response`() {
        assertThat(TestDataSetup.createdTeamID("""{
            "success": true,
            "team": {"id": "team-01", "name": "stress-test-team"}
        }""".trimIndent())).isEqualTo("team-01")
    }

    @Test
    fun `names stress applications uniquely per run while retaining their ordinal`() {
        assertThat(TestDataSetup.stressApplicationName("run-123", 2))
            .isEqualTo("stress-test-run-123-02")
    }

    @Test
    fun `defines the deterministic catalogue required by the SDK stress mix`() {
        val toggles = TestDataSetup.stressToggleCatalogue()

        assertThat(toggles.map { it.path }).containsExactly(
            "stress.no-rule",
            "stress.local-rule",
            "stress.parent-disabled",
            "stress.parent-disabled.child",
            "stress.country-rule",
            "stress.ipv4-rule",
            "stress.ipv6-rule",
        )
        assertThat(toggles.single { it.path == "stress.parent-disabled" }.enabled).isFalse()
        assertThat(toggles.single { it.path == "stress.local-rule" }.activationRule)
            .isEqualTo(TestDataSetup.ActivationRule("attribute", "pro", "attributes.plan"))
        assertThat(toggles.single { it.path == "stress.country-rule" }.activationRule)
            .isEqualTo(TestDataSetup.ActivationRule("country", "BR", "country"))
        assertThat(toggles.single { it.path == "stress.ipv4-rule" }.activationRule)
            .isEqualTo(TestDataSetup.ActivationRule("ip", "203.0.113.0/24", "ip"))
        assertThat(toggles.single { it.path == "stress.ipv6-rule" }.activationRule)
            .isEqualTo(TestDataSetup.ActivationRule("ip", "2001:db8::/32", "ip"))
    }

    @Test
    fun `provisions every toggle path referenced by the Gatling SDK mix`() {
        val scenarioDocument = jacksonObjectMapper().readTree(
            File("src/gatling/resources/sdk-stress-scenarios.json"),
        )
        val scenarioPaths = scenarioDocument.map { scenario ->
            jacksonObjectMapper().readTree(scenario["body"].asText())["path"].asText()
        }.toSet()

        assertThat(TestDataSetup.stressToggleCatalogue().map { it.path })
            .containsAll(scenarioPaths)
    }
}
