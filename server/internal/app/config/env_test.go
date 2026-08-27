package config

import "testing"

func TestCookieSecure_DefaultsToTrue(t *testing.T) {
	if !CookieSecure() {
		t.Error("expected CookieSecure to default to true when COOKIE_SECURE is unset")
	}
}

func TestCookieSecure_CanBeDisabledExplicitly(t *testing.T) {
	t.Setenv("COOKIE_SECURE", "false")
	if CookieSecure() {
		t.Error("expected CookieSecure to be false when COOKIE_SECURE=false")
	}
}

func TestCookieSecure_InvalidValueFailsSafeToTrue(t *testing.T) {
	t.Setenv("COOKIE_SECURE", "not-a-bool")
	if !CookieSecure() {
		t.Error("expected CookieSecure to fail safe to true for an invalid value")
	}
}

func TestAllowedOrigins_DefaultsToEmpty(t *testing.T) {
	if origins := AllowedOrigins(); len(origins) != 0 {
		t.Errorf("expected no allowed origins by default, got %v", origins)
	}
}

func TestAllowedOrigins_ParsesCommaSeparatedList(t *testing.T) {
	t.Setenv("CORS_ALLOWED_ORIGINS", "https://a.example.com, https://b.example.com")
	origins := AllowedOrigins()
	if len(origins) != 2 || origins[0] != "https://a.example.com" || origins[1] != "https://b.example.com" {
		t.Errorf("unexpected origins: %v", origins)
	}
}

func TestServerPort_DefaultsTo3056(t *testing.T) {
	if ServerPort() != "3056" {
		t.Errorf("expected default port 3056, got %s", ServerPort())
	}
}

func TestServerPort_ReadsEnvVar(t *testing.T) {
	t.Setenv("SERVER_PORT", "9090")
	if ServerPort() != "9090" {
		t.Errorf("expected port 9090, got %s", ServerPort())
	}
}

func TestDBPath_DefaultsToDbTogglesDb(t *testing.T) {
	if DBPath() != "./db/toggles.db" {
		t.Errorf("expected default './db/toggles.db', got %s", DBPath())
	}
}

func TestDBPath_ReadsEnvVar(t *testing.T) {
	t.Setenv("DB_PATH", "/tmp/custom.db")
	if DBPath() != "/tmp/custom.db" {
		t.Errorf("expected '/tmp/custom.db', got %s", DBPath())
	}
}
