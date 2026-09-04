package entity

import "testing"

func TestNewSecretKey(t *testing.T) {
	sk := NewSecretKey("API Access Key", "app1", "user1", true)

	if sk.ID == "" {
		t.Error("expected ID to be generated, got empty string")
	}
	if sk.Name != "API Access Key" {
		t.Errorf("expected name %q, got %q", "API Access Key", sk.Name)
	}
	if sk.ApplicationID != "app1" {
		t.Errorf("expected application ID %q, got %q", "app1", sk.ApplicationID)
	}
	if sk.CreatedBy != "user1" {
		t.Errorf("expected created by %q, got %q", "user1", sk.CreatedBy)
	}
	if !sk.Active {
		t.Error("expected Active to be true when requested")
	}
	// v2.6 §5.1: toda chave nova nasce IsCurrent — é a "atual" por definição no momento em que é
	// criada, mesmo quando ainda pendente de aprovação (Active=false).
	if !sk.IsCurrent {
		t.Error("expected a freshly constructed key to be IsCurrent")
	}
	if sk.RevokedAt != nil {
		t.Error("expected a freshly constructed key to not be revoked")
	}
	if sk.LastUsedAt != nil {
		t.Error("expected a freshly constructed key to have never been used")
	}
}

func TestNewSecretKey_Pending(t *testing.T) {
	sk := NewSecretKey("API Access Key", "app1", "user1", false)

	if sk.Active {
		t.Error("expected Active to be false when requested")
	}
}
