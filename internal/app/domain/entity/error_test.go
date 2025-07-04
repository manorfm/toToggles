package entity

import (
	"testing"
)

func TestNewAppError(t *testing.T) {
	code := "T0001"
	message := "Test error message"

	err := NewAppError(code, message)

	if err.Code != code {
		t.Errorf("Expected code %s, got %s", code, err.Code)
	}

	if err.Message != message {
		t.Errorf("Expected message %s, got %s", message, err.Message)
	}
}

func TestAppError_Error(t *testing.T) {
	code := "T0001"
	message := "Test error message"

	err := NewAppError(code, message)
	errorString := err.Error()

	if errorString != message {
		t.Errorf("Expected error string %s, got %s", message, errorString)
	}
}
