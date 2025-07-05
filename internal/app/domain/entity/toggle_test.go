package entity

import (
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
