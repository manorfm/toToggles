package entity

import (
	"testing"
	"time"
)

func TestNewSession_GeneratesRandomTokenAndStoresOnlyItsHash(t *testing.T) {
	session, raw, err := NewSession("user-1", SessionPurposeAuth, time.Hour)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if raw == "" {
		t.Fatal("expected a non-empty raw token")
	}
	if session.TokenHash == "" {
		t.Fatal("expected a non-empty token hash")
	}
	if session.TokenHash == raw {
		t.Fatal("token hash must not equal the raw token")
	}
	if session.TokenHash != HashSessionToken(raw) {
		t.Error("stored hash must match HashSessionToken(raw)")
	}
}

func TestNewSession_GeneratesDifferentTokensEachTime(t *testing.T) {
	_, raw1, err := NewSession("user-1", SessionPurposeAuth, time.Hour)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	_, raw2, err := NewSession("user-1", SessionPurposeAuth, time.Hour)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if raw1 == raw2 {
		t.Error("expected two different sessions to have different raw tokens")
	}
}

func TestNewSession_SetsUserIDPurposeAndExpiry(t *testing.T) {
	before := time.Now()
	session, _, err := NewSession("user-42", SessionPurposePasswordChange, time.Hour)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	after := time.Now()

	if session.UserID != "user-42" {
		t.Errorf("expected UserID 'user-42', got '%s'", session.UserID)
	}
	if session.Purpose != SessionPurposePasswordChange {
		t.Errorf("expected purpose password_change, got '%s'", session.Purpose)
	}
	if session.ExpiresAt.Before(before.Add(time.Hour)) || session.ExpiresAt.After(after.Add(time.Hour)) {
		t.Errorf("expected ExpiresAt to be ~1h from now, got %v", session.ExpiresAt)
	}
}

func TestSession_IsExpired(t *testing.T) {
	expired := &Session{ExpiresAt: time.Now().Add(-time.Minute)}
	if !expired.IsExpired() {
		t.Error("expected session with past ExpiresAt to be expired")
	}

	valid := &Session{ExpiresAt: time.Now().Add(time.Minute)}
	if valid.IsExpired() {
		t.Error("expected session with future ExpiresAt to not be expired")
	}
}

func TestHashSessionToken_IsDeterministicAndDistinctPerInput(t *testing.T) {
	if HashSessionToken("abc") != HashSessionToken("abc") {
		t.Error("expected the same input to always hash the same way")
	}
	if HashSessionToken("abc") == HashSessionToken("abd") {
		t.Error("expected different inputs to hash differently")
	}
}

func TestSession_BeforeCreate_GeneratesIDWhenEmpty(t *testing.T) {
	session := &Session{}
	if err := session.BeforeCreate(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if session.ID == "" {
		t.Error("expected BeforeCreate to generate a non-empty ID")
	}
}

func TestSession_BeforeCreate_DoesNotOverwriteExistingID(t *testing.T) {
	session := &Session{ID: "existing-id"}
	if err := session.BeforeCreate(nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if session.ID != "existing-id" {
		t.Errorf("expected ID to remain 'existing-id', got '%s'", session.ID)
	}
}
