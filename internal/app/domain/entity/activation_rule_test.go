package entity

import (
	"encoding/json"
	"testing"
)

func TestActivationRule_ValidateRule(t *testing.T) {
	tests := []struct {
		name        string
		rule        ActivationRule
		expectError bool
		errorMsg    string
	}{
		{
			name: "valid percentage rule",
			rule: ActivationRule{
				Type:  ActivationRuleTypePercentage,
				Value: "50",
			},
			expectError: false,
		},
		{
			name: "valid parameter rule",
			rule: ActivationRule{
				Type:  ActivationRuleTypeParameter,
				Value: "premium",
			},
			expectError: false,
		},
		{
			name: "valid user_id rule",
			rule: ActivationRule{
				Type:  ActivationRuleTypeUserID,
				Value: "user123",
			},
			expectError: false,
		},
		{
			name: "valid ip rule",
			rule: ActivationRule{
				Type:  ActivationRuleTypeIP,
				Value: "192.168.1.1",
			},
			expectError: false,
		},
		{
			name: "valid country rule",
			rule: ActivationRule{
				Type:  ActivationRuleTypeCountry,
				Value: "BR",
			},
			expectError: false,
		},
		{
			name: "valid time rule",
			rule: ActivationRule{
				Type:  ActivationRuleTypeTime,
				Value: "09:00-17:00",
			},
			expectError: false,
		},
		{
			name: "valid canary rule",
			rule: ActivationRule{
				Type:  ActivationRuleTypeCanary,
				Value: "v2.0",
			},
			expectError: false,
		},
		{
			name: "empty percentage value",
			rule: ActivationRule{
				Type:  ActivationRuleTypePercentage,
				Value: "",
			},
			expectError: true,
			errorMsg:    "valor de porcentagem é obrigatório",
		},
		{
			name: "empty parameter value",
			rule: ActivationRule{
				Type:  ActivationRuleTypeParameter,
				Value: "",
			},
			expectError: true,
			errorMsg:    "valor do parâmetro é obrigatório",
		},
		{
			name: "empty user_id value",
			rule: ActivationRule{
				Type:  ActivationRuleTypeUserID,
				Value: "",
			},
			expectError: true,
			errorMsg:    "valor do user ID é obrigatório",
		},
		{
			name: "empty ip value",
			rule: ActivationRule{
				Type:  ActivationRuleTypeIP,
				Value: "",
			},
			expectError: true,
			errorMsg:    "valor do IP é obrigatório",
		},
		{
			name: "empty country value",
			rule: ActivationRule{
				Type:  ActivationRuleTypeCountry,
				Value: "",
			},
			expectError: true,
			errorMsg:    "valor do país é obrigatório",
		},
		{
			name: "empty time value",
			rule: ActivationRule{
				Type:  ActivationRuleTypeTime,
				Value: "",
			},
			expectError: true,
			errorMsg:    "valor do tempo é obrigatório",
		},
		{
			name: "empty canary value",
			rule: ActivationRule{
				Type:  ActivationRuleTypeCanary,
				Value: "",
			},
			expectError: true,
			errorMsg:    "valor do canary é obrigatório",
		},
		{
			name: "invalid rule type",
			rule: ActivationRule{
				Type:  ActivationRuleType("invalid"),
				Value: "test",
			},
			expectError: true,
			errorMsg:    "tipo de regra inválido: invalid",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.rule.ValidateRule()

			if tt.expectError {
				if err == nil {
					t.Errorf("Expected error but got none")
					return
				}
				if err.Error() != tt.errorMsg {
					t.Errorf("Expected error message '%s', got '%s'", tt.errorMsg, err.Error())
				}
			} else {
				if err != nil {
					t.Errorf("Expected no error but got: %v", err)
				}
			}
		})
	}
}

func TestActivationRule_JSONSerialization(t *testing.T) {
	rule := ActivationRule{
		Type:   ActivationRuleTypePercentage,
		Value:  "75",
		Config: json.RawMessage(`{"description": "75% activation"}`),
	}

	// Test serialization
	data, err := json.Marshal(rule)
	if err != nil {
		t.Fatalf("Failed to marshal ActivationRule: %v", err)
	}

	// Test deserialization
	var unmarshaled ActivationRule
	err = json.Unmarshal(data, &unmarshaled)
	if err != nil {
		t.Fatalf("Failed to unmarshal ActivationRule: %v", err)
	}

	// Verify values
	if unmarshaled.Type != rule.Type {
		t.Errorf("Expected Type %s, got %s", rule.Type, unmarshaled.Type)
	}
	if unmarshaled.Value != rule.Value {
		t.Errorf("Expected Value %s, got %s", rule.Value, unmarshaled.Value)
	}
	// Compare config by converting both to strings and ignoring whitespace differences
	expectedConfig := `{"description":"75% activation"}`
	actualConfig := string(unmarshaled.Config)
	if actualConfig != expectedConfig {
		t.Errorf("Expected Config %s, got %s", expectedConfig, actualConfig)
	}
}

func TestGetRuleTypeOptions(t *testing.T) {
	options := GetRuleTypeOptions()

	expectedTypes := []ActivationRuleType{
		ActivationRuleTypePercentage,
		ActivationRuleTypeParameter,
		ActivationRuleTypeUserID,
		ActivationRuleTypeIP,
		ActivationRuleTypeCountry,
		ActivationRuleTypeTime,
		ActivationRuleTypeCanary,
	}

	// Verify all expected types are present
	for _, expectedType := range expectedTypes {
		if _, exists := options[expectedType]; !exists {
			t.Errorf("Expected rule type %s to be present in options", expectedType)
		}
	}

	// Verify each option has a description
	for ruleType, description := range options {
		if description == "" {
			t.Errorf("Rule type %s has empty description", ruleType)
		}
	}

	// Verify expected count
	if len(options) != len(expectedTypes) {
		t.Errorf("Expected %d options, got %d", len(expectedTypes), len(options))
	}
}