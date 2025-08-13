package entity

import (
	"encoding/json"
	"testing"
)

func TestNewToggle(t *testing.T) {
	value := "test"
	enabled := true
	path := "test.path"
	level := 1
	parentID := "parent123"
	appID := "app123"

	toggle := NewToggle(value, enabled, path, level, &parentID, appID)

	if toggle.Value != value {
		t.Errorf("Expected value %s, got %s", value, toggle.Value)
	}

	if toggle.Enabled != enabled {
		t.Errorf("Expected enabled %v, got %v", enabled, toggle.Enabled)
	}

	if toggle.Path != path {
		t.Errorf("Expected path %s, got %s", path, toggle.Path)
	}

	if toggle.Level != level {
		t.Errorf("Expected level %d, got %d", level, toggle.Level)
	}

	if *toggle.ParentID != parentID {
		t.Errorf("Expected parentID %s, got %s", parentID, *toggle.ParentID)
	}

	if toggle.AppID != appID {
		t.Errorf("Expected appID %s, got %s", appID, toggle.AppID)
	}

	if toggle.ID == "" {
		t.Error("Expected ID to be generated, got empty string")
	}
}

func TestParseTogglePath(t *testing.T) {
	tests := []struct {
		name     string
		path     string
		expected []string
	}{
		{
			name:     "simple path",
			path:     "test",
			expected: []string{"test"},
		},
		{
			name:     "nested path",
			path:     "esse.campo.pode.ser.extenso",
			expected: []string{"esse", "campo", "pode", "ser", "extenso"},
		},
		{
			name:     "empty path",
			path:     "",
			expected: []string{""},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ParseTogglePath(tt.path)
			if len(result) != len(tt.expected) {
				t.Errorf("Expected length %d, got %d", len(tt.expected), len(result))
			}
			for i, expected := range tt.expected {
				if result[i] != expected {
					t.Errorf("Expected %s at position %d, got %s", expected, i, result[i])
				}
			}
		})
	}
}

func TestBuildTogglePath(t *testing.T) {
	tests := []struct {
		name     string
		parts    []string
		expected string
	}{
		{
			name:     "single part",
			parts:    []string{"test"},
			expected: "test",
		},
		{
			name:     "multiple parts",
			parts:    []string{"esse", "campo", "pode", "ser", "extenso"},
			expected: "esse.campo.pode.ser.extenso",
		},
		{
			name:     "empty parts",
			parts:    []string{},
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := BuildTogglePath(tt.parts)
			if result != tt.expected {
				t.Errorf("Expected %s, got %s", tt.expected, result)
			}
		})
	}
}

func TestToggle_IsEnabled(t *testing.T) {
	tests := []struct {
		name     string
		toggle   *Toggle
		expected bool
	}{
		{
			name: "enabled toggle without parent",
			toggle: &Toggle{
				Enabled: true,
			},
			expected: true,
		},
		{
			name: "disabled toggle without parent",
			toggle: &Toggle{
				Enabled: false,
			},
			expected: false,
		},
		{
			name: "enabled toggle with enabled parent",
			toggle: &Toggle{
				Enabled: true,
				Parent: &Toggle{
					Enabled: true,
				},
			},
			expected: true,
		},
		{
			name: "enabled toggle with disabled parent",
			toggle: &Toggle{
				Enabled: true,
				Parent: &Toggle{
					Enabled: false,
				},
			},
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := tt.toggle.IsEnabled()
			if result != tt.expected {
				t.Errorf("Expected %v, got %v", tt.expected, result)
			}
		})
	}
}

func TestToggle_GetFullPath(t *testing.T) {
	tests := []struct {
		name     string
		toggle   *Toggle
		expected string
	}{
		{
			name: "toggle without parent",
			toggle: &Toggle{
				Value: "test",
			},
			expected: "test",
		},
		{
			name: "toggle with parent",
			toggle: &Toggle{
				Value: "child",
				Parent: &Toggle{
					Value: "parent",
				},
			},
			expected: "parent.child",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := tt.toggle.GetFullPath()
			if result != tt.expected {
				t.Errorf("Expected %s, got %s", tt.expected, result)
			}
		})
	}
}

func TestToggle_SetActivationRule(t *testing.T) {
	toggle := NewToggle("test", true, "test", 0, nil, "app123")

	tests := []struct {
		name        string
		rule        *ActivationRule
		expectError bool
		errorMsg    string
	}{
		{
			name: "valid percentage rule",
			rule: &ActivationRule{
				Type:  ActivationRuleTypePercentage,
				Value: "50",
			},
			expectError: false,
		},
		{
			name: "valid parameter rule",
			rule: &ActivationRule{
				Type:  ActivationRuleTypeParameter,
				Value: "premium",
			},
			expectError: false,
		},
		{
			name: "nil rule",
			rule: nil,
			expectError: false,
		},
		{
			name: "invalid rule - empty value",
			rule: &ActivationRule{
				Type:  ActivationRuleTypePercentage,
				Value: "",
			},
			expectError: true,
			errorMsg:    "valor de porcentagem é obrigatório",
		},
		{
			name: "invalid rule - invalid type",
			rule: &ActivationRule{
				Type:  ActivationRuleType("invalid"),
				Value: "test",
			},
			expectError: true,
			errorMsg:    "tipo de regra inválido: invalid",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := toggle.SetActivationRule(tt.rule)

			if tt.expectError {
				if err == nil {
					t.Errorf("Expected error but got none")
					return
				}
				if err.Error() != tt.errorMsg {
					t.Errorf("Expected error message '%s', got '%s'", tt.errorMsg, err.Error())
				}
				// Verify rule was not set on error
				if toggle.HasActivationRule {
					t.Errorf("Expected HasActivationRule to be false after error")
				}
				if toggle.ActivationRule != nil {
					t.Errorf("Expected ActivationRule to be nil after error")
				}
			} else {
				if err != nil {
					t.Errorf("Expected no error but got: %v", err)
				}

				if tt.rule == nil {
					// Setting nil rule should clear the rule
					if toggle.HasActivationRule {
						t.Errorf("Expected HasActivationRule to be false for nil rule")
					}
					if toggle.ActivationRule != nil {
						t.Errorf("Expected ActivationRule to be nil for nil rule")
					}
				} else {
					// Setting valid rule should set the rule
					if !toggle.HasActivationRule {
						t.Errorf("Expected HasActivationRule to be true for valid rule")
					}
					if toggle.ActivationRule == nil {
						t.Errorf("Expected ActivationRule to be set for valid rule")
					}
					if toggle.ActivationRule != nil && toggle.ActivationRule.Type != tt.rule.Type {
						t.Errorf("Expected rule type %s, got %s", tt.rule.Type, toggle.ActivationRule.Type)
					}
					if toggle.ActivationRule != nil && toggle.ActivationRule.Value != tt.rule.Value {
						t.Errorf("Expected rule value %s, got %s", tt.rule.Value, toggle.ActivationRule.Value)
					}
				}
			}
		})
	}
}

func TestToggle_ClearActivationRule(t *testing.T) {
	toggle := NewToggle("test", true, "test", 0, nil, "app123")

	// First set a rule
	rule := &ActivationRule{
		Type:  ActivationRuleTypePercentage,
		Value: "50",
	}
	err := toggle.SetActivationRule(rule)
	if err != nil {
		t.Fatalf("Failed to set activation rule: %v", err)
	}

	// Verify rule is set
	if !toggle.HasActivationRule {
		t.Errorf("Expected HasActivationRule to be true before clearing")
	}
	if toggle.ActivationRule == nil {
		t.Errorf("Expected ActivationRule to be set before clearing")
	}

	// Clear the rule
	toggle.ClearActivationRule()

	// Verify rule is cleared
	if toggle.HasActivationRule {
		t.Errorf("Expected HasActivationRule to be false after clearing")
	}
	if toggle.ActivationRule != nil {
		t.Errorf("Expected ActivationRule to be nil after clearing")
	}
}

func TestToggle_JSONSerializationWithActivationRule(t *testing.T) {
	toggle := NewToggle("test", true, "test.feature", 0, nil, "app123")

	// Set an activation rule
	rule := &ActivationRule{
		Type:   ActivationRuleTypePercentage,
		Value:  "75",
		Config: json.RawMessage(`{"description": "75% activation"}`),
	}
	err := toggle.SetActivationRule(rule)
	if err != nil {
		t.Fatalf("Failed to set activation rule: %v", err)
	}

	// Test serialization
	data, err := json.Marshal(toggle)
	if err != nil {
		t.Fatalf("Failed to marshal Toggle: %v", err)
	}

	// Test deserialization
	var unmarshaled Toggle
	err = json.Unmarshal(data, &unmarshaled)
	if err != nil {
		t.Fatalf("Failed to unmarshal Toggle: %v", err)
	}

	// Verify basic fields
	if unmarshaled.ID != toggle.ID {
		t.Errorf("Expected ID %s, got %s", toggle.ID, unmarshaled.ID)
	}
	if unmarshaled.Value != toggle.Value {
		t.Errorf("Expected Value %s, got %s", toggle.Value, unmarshaled.Value)
	}
	if unmarshaled.HasActivationRule != toggle.HasActivationRule {
		t.Errorf("Expected HasActivationRule %v, got %v", toggle.HasActivationRule, unmarshaled.HasActivationRule)
	}

	// Verify activation rule
	if unmarshaled.ActivationRule == nil {
		t.Errorf("Expected ActivationRule to be set after unmarshaling")
	} else {
		if unmarshaled.ActivationRule.Type != rule.Type {
			t.Errorf("Expected rule type %s, got %s", rule.Type, unmarshaled.ActivationRule.Type)
		}
		if unmarshaled.ActivationRule.Value != rule.Value {
			t.Errorf("Expected rule value %s, got %s", rule.Value, unmarshaled.ActivationRule.Value)
		}
		expectedConfig := `{"description":"75% activation"}`
		actualConfig := string(unmarshaled.ActivationRule.Config)
		if actualConfig != expectedConfig {
			t.Errorf("Expected rule config %s, got %s", expectedConfig, actualConfig)
		}
	}
}

func TestNewToggle_InitialActivationRuleState(t *testing.T) {
	toggle := NewToggle("test", true, "test", 0, nil, "app123")

	// Verify initial state
	if toggle.HasActivationRule {
		t.Errorf("Expected HasActivationRule to be false for new toggle")
	}
	if toggle.ActivationRule != nil {
		t.Errorf("Expected ActivationRule to be nil for new toggle")
	}
}
