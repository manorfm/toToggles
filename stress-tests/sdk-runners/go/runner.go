package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	totoggle "github.com/manorfm/toToggles/totoggle_go"
	"github.com/manorfm/toToggles/totoggle_go/httpcontext"
)

const (
	defaultBindAddress = "127.0.0.1"
	defaultPort        = 19091
	maxRequestBytes    = 16 << 10
)

// RunnerConfig configures a local-only stress sidecar. ServerURL and SecretKey are deliberately
// explicit: a stress runner must never silently target an arbitrary environment.
type RunnerConfig struct {
	ServerURL              string
	SecretKey              string
	HTTPTimeout            time.Duration
	BindAddress            string
	Port                   int
	AllowNonLoopbackTarget bool
}

// Runner evaluates flags through the production Go SDK. It does not reproduce SDK evaluation
// logic, so stress scenarios exercise catalog synchronization and request-local context exactly
// as an HTTP application would.
type Runner struct {
	client    *totoggle.Client
	resolver  *httpcontext.Resolver
	closeOnce sync.Once
}

type scenarioContext struct {
	UserID     string            `json:"userId"`
	RolloutKey string            `json:"rolloutKey"`
	Cohort     string            `json:"cohort"`
	Attributes map[string]string `json:"attributes"`
}

type evaluationRequest struct {
	Path    string          `json:"path"`
	Context scenarioContext `json:"context"`
}

type scenarioContextKey struct{}

// NewRunner starts an SDK client with a loopback-trusted HTTP context adapter. Network context
// is still derived exclusively from Forwarded/CF-IPCountry headers on the incoming request;
// request JSON contains only application-owned values.
func NewRunner(config RunnerConfig) (*Runner, error) {
	config = normalizedRunnerConfig(config)
	if err := validateRunnerConfig(config); err != nil {
		return nil, err
	}
	resolver := httpcontext.New(httpcontext.Options{
		TrustedProxyAddresses: []string{"127.0.0.1", "::1"},
		ApplicationValues: func(request *http.Request) httpcontext.ApplicationValues {
			input, _ := request.Context().Value(scenarioContextKey{}).(scenarioContext)
			return httpcontext.ApplicationValues{
				UserID:     input.UserID,
				RolloutKey: input.RolloutKey,
				Cohort:     input.Cohort,
				Attributes: input.Attributes,
			}
		},
	})
	clientConfig, err := totoggle.NewConfig(
		"totoggle-stress-go-runner",
		config.ServerURL,
		config.SecretKey,
		totoggle.WithHTTPTimeout(config.HTTPTimeout),
		totoggle.WithRefreshInterval(5*time.Second),
		totoggle.WithToggleContextResolver(resolver),
	)
	if err != nil {
		return nil, fmt.Errorf("invalid SDK configuration: %w", err)
	}
	client := totoggle.New(clientConfig)
	if err := client.Start(context.Background()); err != nil || !client.IsHealthy() {
		client.Shutdown()
		return nil, errors.New("SDK catalog was not available at startup")
	}
	return &Runner{client: client, resolver: resolver}, nil
}

func normalizedRunnerConfig(config RunnerConfig) RunnerConfig {
	if config.BindAddress == "" {
		config.BindAddress = defaultBindAddress
	}
	if config.Port == 0 {
		config.Port = defaultPort
	}
	return config
}

func validateRunnerConfig(config RunnerConfig) error {
	parsedURL, err := url.ParseRequestURI(config.ServerURL)
	if err != nil || (parsedURL.Scheme != "http" && parsedURL.Scheme != "https") || parsedURL.Host == "" || parsedURL.User != nil || parsedURL.RawQuery != "" || parsedURL.Fragment != "" {
		return errors.New("STRESS_SERVER_URL must be an absolute HTTP(S) URL without credentials")
	}
	if !config.AllowNonLoopbackTarget && !isLoopbackHost(parsedURL.Hostname()) {
		return errors.New("STRESS_SERVER_URL must not target a non-loopback host unless ALLOW_NON_LOOPBACK_STRESS_TARGETS=yes")
	}
	if !strings.HasPrefix(config.SecretKey, "sk_") {
		return errors.New("STRESS_SECRET_KEY must be a valid secret key")
	}
	if config.HTTPTimeout <= 0 {
		return errors.New("HTTP timeout must be positive")
	}
	if config.BindAddress == "" {
		config.BindAddress = defaultBindAddress
	}
	address, err := netip.ParseAddr(config.BindAddress)
	if err != nil || !address.IsLoopback() {
		return errors.New("stress runner bind address must be loopback")
	}
	if config.Port < 1 || config.Port > 65535 {
		return errors.New("stress runner port must be between 1 and 65535")
	}
	return nil
}

func isLoopbackHost(host string) bool {
	return strings.EqualFold(host, "localhost") || host == "127.0.0.1" || host == "::1"
}

// Handler returns the local sidecar API. POST /evaluate accepts only domain context:
// {"path":"payments.card","context":{"userId":"...","rolloutKey":"...","cohort":"...","attributes":{"plan":"pro"}}}.
// IP and country are intentionally omitted from this JSON and come from trusted proxy headers.
func (r *Runner) Handler() http.Handler {
	return http.HandlerFunc(r.serveHTTP)
}

func (r *Runner) serveHTTP(writer http.ResponseWriter, request *http.Request) {
	if request.URL.Path == "/health" {
		if request.Method != http.MethodGet {
			writeStatus(writer, http.StatusMethodNotAllowed)
			return
		}
		if !r.client.IsHealthy() {
			writeStatus(writer, http.StatusServiceUnavailable)
			return
		}
		writer.Header().Set("Content-Type", "application/json")
		writer.WriteHeader(http.StatusOK)
		_, _ = writer.Write([]byte(`{"status":"ok"}`))
		return
	}
	if request.URL.Path != "/evaluate" {
		writeStatus(writer, http.StatusNotFound)
		return
	}
	if request.Method != http.MethodPost {
		writeStatus(writer, http.StatusMethodNotAllowed)
		return
	}
	if !strings.HasPrefix(request.Header.Get("Content-Type"), "application/json") {
		writeStatus(writer, http.StatusUnsupportedMediaType)
		return
	}
	input, ok := decodeEvaluationRequest(request.Body)
	if !ok {
		writeStatus(writer, http.StatusBadRequest)
		return
	}
	if !r.client.IsHealthy() {
		writeStatus(writer, http.StatusServiceUnavailable)
		return
	}

	request = request.WithContext(context.WithValue(request.Context(), scenarioContextKey{}, input.Context))
	var active bool
	r.resolver.Middleware(http.HandlerFunc(func(_ http.ResponseWriter, contextualRequest *http.Request) {
		active = r.client.IsActiveContext(contextualRequest.Context(), input.Path)
	})).ServeHTTP(writer, request)
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(http.StatusOK)
	_, _ = writer.Write([]byte(`{"active":` + strconv.FormatBool(active) + `}`))
}

func decodeEvaluationRequest(body io.ReadCloser) (evaluationRequest, bool) {
	defer body.Close()
	decoder := json.NewDecoder(io.LimitReader(body, maxRequestBytes+1))
	decoder.DisallowUnknownFields()
	var input evaluationRequest
	if decoder.Decode(&input) != nil || decoder.Decode(&struct{}{}) != io.EOF || !validInput(input) {
		return evaluationRequest{}, false
	}
	return input, true
}

func validInput(input evaluationRequest) bool {
	if strings.TrimSpace(input.Path) == "" || len(input.Path) > 512 || len(input.Context.Attributes) > 32 {
		return false
	}
	for _, value := range []string{input.Context.UserID, input.Context.RolloutKey, input.Context.Cohort} {
		if len(value) > 1024 {
			return false
		}
	}
	for name, value := range input.Context.Attributes {
		if strings.TrimSpace(name) == "" || len(name) > 128 || len(value) > 1024 {
			return false
		}
	}
	return true
}

func writeStatus(writer http.ResponseWriter, status int) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_, _ = writer.Write([]byte(`{"error":"request rejected"}`))
}

// Close releases the SDK refresh loop. The context is accepted so command shutdown can use the
// same lifecycle shape as http.Server.Shutdown; the SDK shutdown itself is synchronous.
func (r *Runner) Close(_ context.Context) {
	r.closeOnce.Do(r.client.Shutdown)
}

// LoadConfigFromEnv reads explicit runner configuration without ever including secrets in errors.
func LoadConfigFromEnv() (RunnerConfig, error) {
	serverURL := strings.TrimSpace(os.Getenv("STRESS_SERVER_URL"))
	secretKey := strings.TrimSpace(os.Getenv("STRESS_SECRET_KEY"))
	if serverURL == "" || secretKey == "" {
		return RunnerConfig{}, errors.New("STRESS_SERVER_URL and STRESS_SECRET_KEY are required")
	}
	port := defaultPort
	if raw := strings.TrimSpace(os.Getenv("STRESS_GO_PORT")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			return RunnerConfig{}, errors.New("STRESS_GO_PORT must be a number")
		}
		port = parsed
	}
	timeout := 10 * time.Second
	if raw := strings.TrimSpace(os.Getenv("STRESS_HTTP_TIMEOUT_MS")); raw != "" {
		milliseconds, err := strconv.Atoi(raw)
		if err != nil || milliseconds < 1 || milliseconds > 120000 {
			return RunnerConfig{}, errors.New("STRESS_HTTP_TIMEOUT_MS must be between 1 and 120000")
		}
		timeout = time.Duration(milliseconds) * time.Millisecond
	}
	config := RunnerConfig{
		ServerURL:              serverURL,
		SecretKey:              secretKey,
		HTTPTimeout:            timeout,
		BindAddress:            strings.TrimSpace(os.Getenv("STRESS_GO_BIND")),
		Port:                   port,
		AllowNonLoopbackTarget: os.Getenv("ALLOW_NON_LOOPBACK_STRESS_TARGETS") == "yes",
	}
	if config.BindAddress == "" {
		config.BindAddress = defaultBindAddress
	}
	if err := validateRunnerConfig(config); err != nil {
		return RunnerConfig{}, err
	}
	return config, nil
}

func listenAddress(config RunnerConfig) string {
	return net.JoinHostPort(config.BindAddress, strconv.Itoa(config.Port))
}
