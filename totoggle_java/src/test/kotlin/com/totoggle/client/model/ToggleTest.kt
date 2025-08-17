package com.totoggle.client.model

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class ToggleTest {
    
    @Test
    fun `should parse path segments correctly`() {
        val toggle = createToggle(path = "user.payments.view-table")
        
        val segments = toggle.getPathSegments()
        
        assertThat(segments).containsExactly("user", "payments", "view-table")
    }
    
    @Test
    fun `should handle single segment path`() {
        val toggle = createToggle(path = "user")
        
        val segments = toggle.getPathSegments()
        
        assertThat(segments).containsExactly("user")
    }
    
    @Test
    fun `should get parent path correctly`() {
        val toggle = createToggle(path = "user.payments.view-table")
        
        val parentPath = toggle.getParentPath()
        
        assertThat(parentPath).isEqualTo("user.payments")
    }
    
    @Test
    fun `should return null parent path for root level`() {
        val toggle = createToggle(path = "user")
        
        val parentPath = toggle.getParentPath()
        
        assertThat(parentPath).isNull()
    }
    
    @Test
    fun `should detect child relationship correctly`() {
        val toggle = createToggle(path = "user.payments.view-table")
        
        assertThat(toggle.isChildOf("user.payments")).isTrue()
        assertThat(toggle.isChildOf("user")).isTrue() // is descendant of user
        assertThat(toggle.isChildOf("other")).isFalse()
        assertThat(toggle.isChildOf("user.payments.view-table")).isFalse() // same path
    }
    
    @Test
    fun `should detect ancestor relationship correctly`() {
        val toggle = createToggle(path = "user.payments")
        
        assertThat(toggle.isAncestorOf("user.payments.view-table")).isTrue()
        assertThat(toggle.isAncestorOf("user.payments.create")).isTrue()
        assertThat(toggle.isAncestorOf("user.other")).isFalse()
        assertThat(toggle.isAncestorOf("user.payments")).isFalse() // same path
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