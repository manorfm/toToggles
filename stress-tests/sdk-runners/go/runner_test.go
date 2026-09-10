package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestRunnerEvaluatesWithRequestLocalDomainAndNetworkContext(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-API-Key") != "sk_stress" {
			t.Fatal("runner did not configure SDK secret key")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"application":{"toggles":[
			{"path":"payments.card","enabled":true,"has_activation_rule":true,"activation_rule":{"type":"attribute","value":"pro","config":{"context_key":"attributes.plan"}}},
			{"path":"network.v6","enabled":true,"has_activation_rule":true,"activation_rule":{"type":"ip","value":"2001:db8::/32","config":{"context_key":"ip"}}},
			{"path":"location.br","enabled":true,"has_activation_rule":true,"activation_rule":{"type":"country","value":"BR","config":{"context_key":"country"}}}
		]}}`))
	}))
	defer upstream.Close()

	runner, err := NewRunner(RunnerConfig{ServerURL: upstream.URL, SecretKey: "sk_stress", HTTPTimeout: time.Second})
	if err != nil {
		t.Fatalf("NewRunner() error = %v", err)
	}
	defer runner.Close(context.Background())

	assertEvaluation(t, runner, `{"path":"payments.card","context":{"attributes":{"plan":"pro"}}}`, nil, true)
	assertEvaluation(t, runner, `{"path":"payments.card","context":{"attributes":{"plan":"free"}}}`, nil, false)
	assertEvaluation(t, runner, `{"path":"network.v6","context":{}}`, map[string]string{"Forwarded": "for=\"[2001:db8::44]\""}, true)
	assertEvaluation(t, runner, `{"path":"location.br","context":{}}`, map[string]string{"CF-IPCountry": "BR"}, true)
}

func TestRunnerRejectsInvalidRequestsWithoutEchoingContext(t *testing.T) {
	runner := newReadyRunner(t)
	defer runner.Close(context.Background())

	request := httptest.NewRequest(http.MethodPost, "/evaluate", strings.NewReader(`{"path":"payments.card","context":{"userId":"sensitive-user"},"unexpected":true}`))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	runner.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusBadRequest)
	}
	if strings.Contains(recorder.Body.String(), "sensitive-user") {
		t.Fatalf("error response leaked request context: %q", recorder.Body.String())
	}

	bad := httptest.NewRequest(http.MethodPost, "/evaluate", strings.NewReader(`{"path":"","context":{}}`))
	bad.Header.Set("Content-Type", "application/json")
	badRecorder := httptest.NewRecorder()
	runner.Handler().ServeHTTP(badRecorder, bad)
	if badRecorder.Code != http.StatusBadRequest || strings.Contains(badRecorder.Body.String(), "\"path\"") {
		t.Fatalf("invalid request response = %d %q", badRecorder.Code, badRecorder.Body.String())
	}
}

func TestRunnerReportsHealthWithoutExposingCatalogDetails(t *testing.T) {
	runner := newReadyRunner(t)
	defer runner.Close(context.Background())

	request := httptest.NewRequest(http.MethodGet, "/health", nil)
	recorder := httptest.NewRecorder()
	runner.Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK || recorder.Body.String() != `{"status":"ok"}` {
		t.Fatalf("health response = %d %q", recorder.Code, recorder.Body.String())
	}
}

func TestLoadConfigRequiresExplicitServerAndSecretAndLoopbackBinding(t *testing.T) {
	t.Setenv("STRESS_SERVER_URL", "")
	t.Setenv("STRESS_SECRET_KEY", "")
	if _, err := LoadConfigFromEnv(); err == nil {
		t.Fatal("LoadConfigFromEnv() accepted missing configuration")
	}

	t.Setenv("STRESS_SERVER_URL", "http://127.0.0.1:8080")
	t.Setenv("STRESS_SECRET_KEY", "sk_stress")
	t.Setenv("STRESS_GO_BIND", "0.0.0.0")
	if _, err := LoadConfigFromEnv(); err == nil {
		t.Fatal("LoadConfigFromEnv() accepted non-loopback bind address")
	}

	t.Setenv("STRESS_GO_BIND", "127.0.0.1")
	config, err := LoadConfigFromEnv()
	if err != nil {
		t.Fatalf("LoadConfigFromEnv() error = %v", err)
	}
	if config.BindAddress != "127.0.0.1" || config.Port == 0 {
		t.Fatalf("config = %#v, want loopback address and port", config)
	}
}

func TestLoadConfigRejectsRemoteCatalogWithoutExplicitAcknowledgement(t *testing.T) {
	t.Setenv("STRESS_SERVER_URL", "https://stress.example.test")
	t.Setenv("STRESS_SECRET_KEY", "sk_stress")
	t.Setenv("ALLOW_NON_LOOPBACK_STRESS_TARGETS", "")
	if _, err := LoadConfigFromEnv(); err == nil {
		t.Fatal("LoadConfigFromEnv() accepted a remote catalog without acknowledgement")
	}

	t.Setenv("ALLOW_NON_LOOPBACK_STRESS_TARGETS", "yes")
	if _, err := LoadConfigFromEnv(); err != nil {
		t.Fatalf("LoadConfigFromEnv() rejected an explicitly acknowledged remote catalog: %v", err)
	}
}

func TestLoadConfigRejectsCatalogURLsWithQueryOrFragment(t *testing.T) {
	t.Setenv("STRESS_SECRET_KEY", "sk_stress")
	for _, serverURL := range []string{
		"http://127.0.0.1:8080?unexpected=true",
		"http://127.0.0.1:8080#fragment",
	} {
		t.Setenv("STRESS_SERVER_URL", serverURL)
		if _, err := LoadConfigFromEnv(); err == nil {
			t.Fatalf("LoadConfigFromEnv() accepted unsafe catalog URL %q", serverURL)
		}
	}
}

func assertEvaluation(t *testing.T, runner *Runner, body string, headers map[string]string, want bool) {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, "/evaluate", strings.NewReader(body))
	request.RemoteAddr = "127.0.0.1:12345"
	request.Header.Set("Content-Type", "application/json")
	for key, value := range headers {
		request.Header.Set(key, value)
	}
	recorder := httptest.NewRecorder()
	runner.Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var response struct {
		Active bool `json:"active"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.Active != want {
		t.Fatalf("active = %v, want %v", response.Active, want)
	}
}

func newReadyRunner(t *testing.T) *Runner {
	t.Helper()
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"application":{"toggles":[]}}`))
	}))
	t.Cleanup(upstream.Close)
	runner, err := NewRunner(RunnerConfig{ServerURL: upstream.URL, SecretKey: "sk_stress", HTTPTimeout: time.Second})
	if err != nil {
		t.Fatalf("NewRunner() error = %v", err)
	}
	return runner
}
