package com.totoggle.client.model

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class ApplicationTest {
    
    @Test
    fun `should find toggle by path`() {
        val toggles = listOf(
            createToggle(path = "user"),
            createToggle(path = "user.payments"),
            createToggle(path = "user.payments.view-table")
        )
        val app = Application("app-id", "Test App", toggles)
        
        val found = app.findToggleByPath("user.payments")
        val notFound = app.findToggleByPath("nonexistent")
        
        assertThat(found).isNotNull
        assertThat(found?.path).isEqualTo("user.payments")
        assertThat(notFound).isNull()
    }
    
    @Test
    fun `should get ancestors correctly`() {
        val toggles = listOf(
            createToggle(path = "user", level = 0),
            createToggle(path = "user.payments", level = 1),
            createToggle(path = "user.payments.view-table", level = 2),
            createToggle(path = "admin", level = 0),
            createToggle(path = "admin.users", level = 1)
        )
        val app = Application("app-id", "Test App", toggles)
        
        val ancestors = app.getAncestorsOf("user.payments.view-table")
        
        assertThat(ancestors).hasSize(2)
        assertThat(ancestors[0].path).isEqualTo("user")
        assertThat(ancestors[1].path).isEqualTo("user.payments")
    }
    
    @Test
    fun `should return empty ancestors for root level`() {
        val toggles = listOf(
            createToggle(path = "user", level = 0)
        )
        val app = Application("app-id", "Test App", toggles)
        
        val ancestors = app.getAncestorsOf("user")
        
        assertThat(ancestors).isEmpty()
    }
    
    @Test
    fun `should get children correctly`() {
        val toggles = listOf(
            createToggle(path = "user", level = 0),
            createToggle(path = "user.payments", level = 1),
            createToggle(path = "user.profile", level = 1),
            createToggle(path = "user.payments.view-table", level = 2),
            createToggle(path = "admin", level = 0)
        )
        val app = Application("app-id", "Test App", toggles)
        
        val children = app.getChildrenOf("user")
        
        assertThat(children).hasSize(3)
        assertThat(children.map { it.path }).containsExactly("user.payments", "user.profile", "user.payments.view-table")
    }
    
    @Test
    fun `should get root toggles correctly`() {
        val toggles = listOf(
            createToggle(path = "user", level = 0),
            createToggle(path = "admin", level = 0),
            createToggle(path = "user.payments", level = 1)
        )
        val app = Application("app-id", "Test App", toggles)
        
        val rootToggles = app.getRootToggles()
        
        assertThat(rootToggles).hasSize(2)
        assertThat(rootToggles.map { it.path }).containsExactlyInAnyOrder("user", "admin")
    }
    
    private fun createToggle(
        id: String = "test-id",
        path: String = "test.path",
        value: String = "test",
        enabled: Boolean = true,
        level: Int = 0,
        parentId: String? = null,
        appId: String = "app-id",
        hasActivationRule: Boolean = false,
        activationRule: ActivationRule = ActivationRule.empty()
    ) = Toggle(
        id = id,
        path = path,
        value = value,
        enabled = enabled,
        level = level,
        parentId = parentId,
        appId = appId,
        hasActivationRule = hasActivationRule,
        activationRule = activationRule
    )
}