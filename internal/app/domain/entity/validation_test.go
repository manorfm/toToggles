package entity

import (
	"testing"
)

func TestValidateApplicationName(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected bool
	}{
		{
			name:     "valid application name",
			input:    "My Application",
			expected: true,
		},
		{
			name:     "empty name",
			input:    "",
			expected: false,
		},
		{
			name:     "name with dangerous characters",
			input:    "App<script>alert('xss')</script>",
			expected: false,
		},
		{
			name:     "name with special characters",
			input:    "App-Name_123",
			expected: true,
		},
		{
			name:     "name too long",
			input:    string(make([]byte, 300)),
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ValidateApplicationName(tt.input)
			if result.IsValid != tt.expected {
				t.Errorf("Expected %v, got %v", tt.expected, result.IsValid)
			}
		})
	}
}

func TestValidateTogglePath(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected bool
	}{
		{
			name:     "valid toggle path",
			input:    "feature.new.dashboard",
			expected: true,
		},
		{
			name:     "empty path",
			input:    "",
			expected: false,
		},
		{
			name:     "path with dangerous characters",
			input:    "feature<script>alert('xss')</script>",
			expected: false,
		},
		{
			name:     "path with consecutive dots",
			input:    "feature..new",
			expected: false,
		},
		{
			name:     "path starting with dot",
			input:    ".feature.new",
			expected: false,
		},
		{
			name:     "path ending with dot",
			input:    "feature.new.",
			expected: false,
		},
		{
			name:     "path with empty segment",
			input:    "feature..new",
			expected: false,
		},
		{
			name:     "path too long",
			input:    string(make([]byte, 1100)),
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ValidateTogglePath(tt.input)
			if result.IsValid != tt.expected {
				t.Errorf("Expected %v, got %v", tt.expected, result.IsValid)
			}
		})
	}
}

func TestValidateToggleID(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected bool
	}{
		{
			name:     "valid toggle ID",
			input:    "01JZNM42NKSANGHZ3G4KKXGCNW",
			expected: true,
		},
		{
			name:     "empty ID",
			input:    "",
			expected: false,
		},
		{
			name:     "invalid ID format",
			input:    "invalid-id",
			expected: false,
		},
		{
			name:     "ID too short",
			input:    "01JZNM42NKSANGHZ3G4KKXGC",
			expected: false,
		},
		{
			name:     "ID too long",
			input:    "01JZNM42NKSANGHZ3G4KKXGCNWX",
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ValidateToggleID(tt.input)
			if result.IsValid != tt.expected {
				t.Errorf("Expected %v, got %v", tt.expected, result.IsValid)
			}
		})
	}
}

func TestValidateApplicationID(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected bool
	}{
		{
			name:     "valid application ID",
			input:    "01JZNM42NKSANGHZ3G4KKXGCNW",
			expected: true,
		},
		{
			name:     "empty ID",
			input:    "",
			expected: false,
		},
		{
			name:     "invalid ID format",
			input:    "invalid-id",
			expected: false,
		},
		{
			name:     "ID too short",
			input:    "01JZNM42NKSANGHZ3G4KKXGC",
			expected: false,
		},
		{
			name:     "ID too long",
			input:    "01JZNM42NKSANGHZ3G4KKXGCNWX",
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ValidateApplicationID(tt.input)
			if result.IsValid != tt.expected {
				t.Errorf("Expected %v, got %v", tt.expected, result.IsValid)
			}
		})
	}
}
