package entity

import (
	"testing"
)

func TestNewApplication(t *testing.T) {
	name := "Test Application"
	app := NewApplication(name)

	if app.Name != name {
		t.Errorf("Expected name %s, got %s", name, app.Name)
	}

	if app.ID == "" {
		t.Error("Expected ID to be generated, got empty string")
	}

	if len(app.ID) < 26 {
		t.Errorf("Expected ID length at least 26, got %d", len(app.ID))
	}
}

func TestGenerateULID(t *testing.T) {
	id1 := generateULID()
	id2 := generateULID()

	if id1 == id2 {
		t.Error("Expected different IDs, got same ID")
	}

	if len(id1) < 26 {
		t.Errorf("Expected ID length at least 26, got %d", len(id1))
	}

	if len(id2) < 26 {
		t.Errorf("Expected ID length at least 26, got %d", len(id2))
	}
}
