package com.totoggle.client.model

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class ActivationRuleTest {
    
    @Test
    fun `should create empty rule correctly`() {
        val rule = ActivationRule.empty()
        
        assertThat(rule.type).isEmpty()
        assertThat(rule.value).isEmpty()
        assertThat(rule.isEmpty()).isTrue()
        assertThat(rule.isValid()).isFalse()
    }
    
    @Test
    fun `should validate rule correctly`() {
        val validRule = ActivationRule("percentage", "25")
        val invalidRule1 = ActivationRule("", "25")
        val invalidRule2 = ActivationRule("percentage", "")
        val emptyRule = ActivationRule("", "")
        
        assertThat(validRule.isValid()).isTrue()
        assertThat(validRule.isEmpty()).isFalse()
        
        assertThat(invalidRule1.isValid()).isFalse()
        assertThat(invalidRule1.isEmpty()).isFalse()
        
        assertThat(invalidRule2.isValid()).isFalse()
        assertThat(invalidRule2.isEmpty()).isFalse()
        
        assertThat(emptyRule.isValid()).isFalse()
        assertThat(emptyRule.isEmpty()).isTrue()
    }
    
    @Test
    fun `should have correct rule type constants`() {
        assertThat(ActivationRule.TYPE_PERCENTAGE).isEqualTo("percentage")
        assertThat(ActivationRule.TYPE_PARAMETER).isEqualTo("parameter")
        assertThat(ActivationRule.TYPE_USER_ID).isEqualTo("user_id")
        assertThat(ActivationRule.TYPE_IP_ADDRESS).isEqualTo("ip_address")
        assertThat(ActivationRule.TYPE_COUNTRY).isEqualTo("country")
        assertThat(ActivationRule.TYPE_TIME).isEqualTo("time")
    }
}