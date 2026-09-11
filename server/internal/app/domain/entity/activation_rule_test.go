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
				Type:   ActivationRuleTypePercentage,
				Value:  "50",
				Config: json.RawMessage(`{"context_key":"rollout_key"}`),
			},
			expectError: false,
		},
		{
			name: "valid attribute rule",
			rule: ActivationRule{
				Type:   ActivationRuleTypeAttribute,
				Value:  "premium",
				Config: json.RawMessage(`{"context_key":"attributes.plan"}`),
			},
			expectError: false,
		},
		{
			name: "valid user_id rule",
			rule: ActivationRule{
				Type:   ActivationRuleTypeUserID,
				Value:  "user123",
				Config: json.RawMessage(`{"context_key":"user_id"}`),
			},
			expectError: false,
		},
		{
			name: "valid ip rule",
			rule: ActivationRule{
				Type:   ActivationRuleTypeIP,
				Value:  "192.168.1.1",
				Config: json.RawMessage(`{"context_key":"ip"}`),
			},
			expectError: false,
		},
		{
			name: "valid country rule",
			rule: ActivationRule{
				Type:   ActivationRuleTypeCountry,
				Value:  "BR",
				Config: json.RawMessage(`{"context_key":"country"}`),
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
			name: "valid cohort rule",
			rule: ActivationRule{
				Type:   ActivationRuleTypeCohort,
				Value:  "v2.0",
				Config: json.RawMessage(`{"context_key":"cohort"}`),
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
			name: "empty attribute value",
			rule: ActivationRule{
				Type:  ActivationRuleTypeAttribute,
				Value: "",
			},
			expectError: true,
			errorMsg:    "valor da regra é obrigatório",
		},
		{
			name: "empty user_id value",
			rule: ActivationRule{
				Type:  ActivationRuleTypeUserID,
				Value: "",
			},
			expectError: true,
			errorMsg:    "valor da regra é obrigatório",
		},
		{
			name: "empty ip value",
			rule: ActivationRule{
				Type:  ActivationRuleTypeIP,
				Value: "",
			},
			expectError: true,
			errorMsg:    "valor da regra é obrigatório",
		},
		{
			name: "empty country value",
			rule: ActivationRule{
				Type:  ActivationRuleTypeCountry,
				Value: "",
			},
			expectError: true,
			errorMsg:    "valor da regra é obrigatório",
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
			name: "time value with garbage text",
			rule: ActivationRule{
				Type:  ActivationRuleTypeTime,
				Value: "asdkjh",
			},
			expectError: true,
			errorMsg:    "valor do tempo deve estar no formato HH:mm-HH:mm (ex.: 09:00-18:00)",
		},
		{
			name: "time value missing the dash separator",
			rule: ActivationRule{
				Type:  ActivationRuleTypeTime,
				Value: "09:0018:00",
			},
			expectError: true,
			errorMsg:    "valor do tempo deve estar no formato HH:mm-HH:mm (ex.: 09:00-18:00)",
		},
		{
			name: "time value with an out-of-range hour",
			rule: ActivationRule{
				Type:  ActivationRuleTypeTime,
				Value: "25:00-18:00",
			},
			expectError: true,
			errorMsg:    "valor do tempo deve estar no formato HH:mm-HH:mm (ex.: 09:00-18:00)",
		},
		{
			name: "time value with an out-of-range minute",
			rule: ActivationRule{
				Type:  ActivationRuleTypeTime,
				Value: "09:60-18:00",
			},
			expectError: true,
			errorMsg:    "valor do tempo deve estar no formato HH:mm-HH:mm (ex.: 09:00-18:00)",
		},
		{
			name: "time value without zero-padded hour",
			rule: ActivationRule{
				Type:  ActivationRuleTypeTime,
				Value: "9:00-18:00",
			},
			expectError: true,
			errorMsg:    "valor do tempo deve estar no formato HH:mm-HH:mm (ex.: 09:00-18:00)",
		},
		{
			name: "valid overnight time window",
			rule: ActivationRule{
				Type:  ActivationRuleTypeTime,
				Value: "22:00-06:00",
			},
			expectError: false,
		},
		{
			name: "empty cohort value",
			rule: ActivationRule{
				Type:  ActivationRuleTypeCohort,
				Value: "",
			},
			expectError: true,
			errorMsg:    "valor da regra é obrigatório",
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

func TestActivationRule_AttributeRequiresNamedAttributeContextKey(t *testing.T) {
	valid := &ActivationRule{Type: ActivationRuleTypeAttribute, Value: "pro", Config: json.RawMessage(`{"context_key":"attributes.plan"}`)}
	invalid := &ActivationRule{Type: ActivationRuleTypeAttribute, Value: "pro", Config: json.RawMessage(`{"context_key":"user_id"}`)}

	if err := valid.ValidateRule(); err != nil {
		t.Fatalf("expected named attribute context key to be valid: %v", err)
	}
	if err := invalid.ValidateRule(); err == nil {
		t.Fatal("expected non-attribute context key to be rejected")
	}
}

func TestActivationRule_ContextKey(t *testing.T) {
	withKey := ActivationRule{Type: ActivationRuleTypePercentage, Value: "50", Config: json.RawMessage(`{"context_key":"rollout_key"}`)}
	if got := withKey.ContextKey(); got != "rollout_key" {
		t.Errorf("expected 'rollout_key', got %q", got)
	}

	noConfig := ActivationRule{Type: ActivationRuleTypeTime, Value: "09:00-17:00"}
	if got := noConfig.ContextKey(); got != "" {
		t.Errorf("expected empty context key for a rule with no config, got %q", got)
	}

	malformed := ActivationRule{Type: ActivationRuleTypePercentage, Value: "50", Config: json.RawMessage(`not json`)}
	if got := malformed.ContextKey(); got != "" {
		t.Errorf("expected empty context key for malformed config, got %q", got)
	}
}

// HasEphemeralContextKeyRisk is advisory-only: validContextKey already restricts percentage's
// context_key to "rollout_key" or "attributes.<name>" (never a bare "ip"/"user_id"/etc — see
// TestActivationRule_ValidateRule), and cohort's to exactly "cohort" — so cohort can never
// exercise this warning at all, and percentage only through an admin-chosen attribute name that
// happens to look ephemeral. This is a heuristic over the NAME an operator picked, not proof of
// what the app resolver actually returns for it — see docs/sdd/rollout-consistency-guardrails.md
// Wave 3.
func TestActivationRule_EphemeralContextKeyWarning(t *testing.T) {
	tests := []struct {
		name string
		rule ActivationRule
		want bool
	}{
		{
			name: "percentage with attributes.ip_address warns",
			rule: ActivationRule{Type: ActivationRuleTypePercentage, Value: "50", Config: json.RawMessage(`{"context_key":"attributes.ip_address"}`)},
			want: true,
		},
		{
			name: "percentage with attributes.client_ip warns",
			rule: ActivationRule{Type: ActivationRuleTypePercentage, Value: "50", Config: json.RawMessage(`{"context_key":"attributes.client_ip"}`)},
			want: true,
		},
		{
			name: "percentage with attributes.session_id warns",
			rule: ActivationRule{Type: ActivationRuleTypePercentage, Value: "50", Config: json.RawMessage(`{"context_key":"attributes.session_id"}`)},
			want: true,
		},
		{
			name: "percentage with attributes.request_token warns",
			rule: ActivationRule{Type: ActivationRuleTypePercentage, Value: "50", Config: json.RawMessage(`{"context_key":"attributes.request_token"}`)},
			want: true,
		},
		{
			name: "percentage with rollout_key does not warn",
			rule: ActivationRule{Type: ActivationRuleTypePercentage, Value: "50", Config: json.RawMessage(`{"context_key":"rollout_key"}`)},
			want: false,
		},
		{
			name: "percentage with attributes.account_id does not warn",
			rule: ActivationRule{Type: ActivationRuleTypePercentage, Value: "50", Config: json.RawMessage(`{"context_key":"attributes.account_id"}`)},
			want: false,
		},
		{
			name: "percentage with attributes.recipient_id does not false-positive on 'ip' substring",
			rule: ActivationRule{Type: ActivationRuleTypePercentage, Value: "50", Config: json.RawMessage(`{"context_key":"attributes.recipient_id"}`)},
			want: false,
		},
		{
			name: "cohort can never carry an ephemeral key (its context_key is always the literal 'cohort')",
			rule: ActivationRule{Type: ActivationRuleTypeCohort, Value: "canary", Config: json.RawMessage(`{"context_key":"cohort"}`)},
			want: false,
		},
		{
			name: "ip rule type itself never warns (ip is its canonical, correct key)",
			rule: ActivationRule{Type: ActivationRuleTypeIP, Value: "10.0.0.0/24", Config: json.RawMessage(`{"context_key":"ip"}`)},
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.rule.HasEphemeralContextKeyRisk(); got != tt.want {
				t.Errorf("expected %v, got %v", tt.want, got)
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
		ActivationRuleTypeAttribute,
		ActivationRuleTypeUserID,
		ActivationRuleTypeIP,
		ActivationRuleTypeCountry,
		ActivationRuleTypeTime,
		ActivationRuleTypeCohort,
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
