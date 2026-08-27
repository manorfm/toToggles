package totoggle

import (
	"fmt"
	"net/http"
	"strings"
	"time"
)

const (
	defaultRefreshInterval   = 5 * time.Minute
	defaultHTTPTimeout       = 10 * time.Second
	defaultEnableOfflineMode = true
)

// Config is the validated configuration for a Client. Build one with NewConfig — its fields are
// read-only in practice (there is no setter API), so a *Config handed to New is exactly what
// validation checked.
type Config struct {
	ApplicationName   string
	ServerURL         string
	SecretKey         string
	RefreshInterval   time.Duration
	HTTPTimeout       time.Duration
	EnableOfflineMode bool
	TimeZone          *time.Location
	// HTTPClient, if set, is used instead of building one from HTTPTimeout — lets a caller share
	// connection pooling/instrumentation with the rest of their app. Go's http.Client.Timeout
	// covers the whole round trip (connect+read), which is the idiomatic Go equivalent of the
	// separate connect/read timeouts some other client libraries expose.
	HTTPClient *http.Client
}

// Option customizes a Config during NewConfig.
type Option func(*Config)

// WithRefreshInterval sets how often the client re-fetches toggles from the server. Default: 5m.
func WithRefreshInterval(d time.Duration) Option {
	return func(c *Config) { c.RefreshInterval = d }
}

// WithHTTPTimeout sets the HTTP client's request timeout, when no HTTPClient is supplied via
// WithHTTPClient. Default: 10s.
func WithHTTPTimeout(d time.Duration) Option {
	return func(c *Config) { c.HTTPTimeout = d }
}

// WithOfflineMode controls whether the client keeps serving the last successfully fetched data
// when the server becomes unreachable (true, the default) or should be treated as unhealthy
// immediately on a failed refresh.
func WithOfflineMode(enabled bool) Option {
	return func(c *Config) { c.EnableOfflineMode = enabled }
}

// WithTimeZone sets the zone "time" activation rules ("09:00-18:00" windows) are evaluated in.
// Default: time.Local. The rule is documented as "24h window in server timezone" — a client has
// no way to know the server's zone on its own, so this should be set explicitly when it differs.
func WithTimeZone(loc *time.Location) Option {
	return func(c *Config) { c.TimeZone = loc }
}

// WithHTTPClient supplies a pre-built *http.Client, overriding HTTPTimeout entirely.
func WithHTTPClient(client *http.Client) Option {
	return func(c *Config) { c.HTTPClient = client }
}

// NewConfig validates and builds a Config. secretKey must start with "sk_" — that prefix is how
// the server identifies its own issued keys.
func NewConfig(applicationName, serverURL, secretKey string, opts ...Option) (*Config, error) {
	cfg := &Config{
		ApplicationName:   applicationName,
		ServerURL:         serverURL,
		SecretKey:         secretKey,
		RefreshInterval:   defaultRefreshInterval,
		HTTPTimeout:       defaultHTTPTimeout,
		EnableOfflineMode: defaultEnableOfflineMode,
		TimeZone:          time.Local,
	}
	for _, opt := range opts {
		opt(cfg)
	}

	if strings.TrimSpace(cfg.ApplicationName) == "" {
		return nil, fmt.Errorf("%w: application name must not be blank", ErrInvalidConfig)
	}
	if strings.TrimSpace(cfg.ServerURL) == "" {
		return nil, fmt.Errorf("%w: server URL must not be blank", ErrInvalidConfig)
	}
	if strings.TrimSpace(cfg.SecretKey) == "" {
		return nil, fmt.Errorf("%w: secret key must not be blank", ErrInvalidConfig)
	}
	if !strings.HasPrefix(cfg.SecretKey, "sk_") {
		return nil, fmt.Errorf("%w: secret key must start with \"sk_\"", ErrInvalidConfig)
	}
	if cfg.RefreshInterval <= 0 {
		return nil, fmt.Errorf("%w: refresh interval must be positive", ErrInvalidConfig)
	}
	if cfg.HTTPTimeout <= 0 {
		return nil, fmt.Errorf("%w: HTTP timeout must be positive", ErrInvalidConfig)
	}

	return cfg, nil
}

// apiURL is the full toggles endpoint derived from ServerURL.
func (c *Config) apiURL() string {
	return strings.TrimRight(c.ServerURL, "/") + "/api/toggles"
}

// httpClient returns HTTPClient if set, otherwise a client built from HTTPTimeout.
func (c *Config) httpClient() *http.Client {
	if c.HTTPClient != nil {
		return c.HTTPClient
	}
	return &http.Client{Timeout: c.HTTPTimeout}
}
