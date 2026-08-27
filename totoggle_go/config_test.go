package totoggle

import (
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewConfig_ValidMinimalConfig_AppliesDefaults(t *testing.T) {
	cfg, err := NewConfig("checkout-web", "https://toggles.example.com", "sk_abc123")
	require.NoError(t, err)

	assert.Equal(t, "checkout-web", cfg.ApplicationName)
	assert.Equal(t, "https://toggles.example.com", cfg.ServerURL)
	assert.Equal(t, "sk_abc123", cfg.SecretKey)
	assert.Equal(t, 5*time.Minute, cfg.RefreshInterval)
	assert.Equal(t, 10*time.Second, cfg.HTTPTimeout)
	assert.True(t, cfg.EnableOfflineMode)
	assert.Equal(t, time.Local, cfg.TimeZone)
}

func TestNewConfig_BlankApplicationName_Fails(t *testing.T) {
	_, err := NewConfig("", "https://toggles.example.com", "sk_abc123")
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrInvalidConfig))
}

func TestNewConfig_BlankServerURL_Fails(t *testing.T) {
	_, err := NewConfig("app", "", "sk_abc123")
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrInvalidConfig))
}

func TestNewConfig_BlankSecretKey_Fails(t *testing.T) {
	_, err := NewConfig("app", "https://toggles.example.com", "")
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrInvalidConfig))
}

func TestNewConfig_SecretKeyMustStartWithSkPrefix(t *testing.T) {
	_, err := NewConfig("app", "https://toggles.example.com", "not-a-secret")
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrInvalidConfig))
}

func TestNewConfig_WithRefreshInterval(t *testing.T) {
	cfg, err := NewConfig("app", "https://toggles.example.com", "sk_abc123", WithRefreshInterval(30*time.Second))
	require.NoError(t, err)
	assert.Equal(t, 30*time.Second, cfg.RefreshInterval)
}

func TestNewConfig_NonPositiveRefreshInterval_Fails(t *testing.T) {
	_, err := NewConfig("app", "https://toggles.example.com", "sk_abc123", WithRefreshInterval(0))
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrInvalidConfig))
}

func TestNewConfig_WithHTTPTimeout(t *testing.T) {
	cfg, err := NewConfig("app", "https://toggles.example.com", "sk_abc123", WithHTTPTimeout(2*time.Second))
	require.NoError(t, err)
	assert.Equal(t, 2*time.Second, cfg.HTTPTimeout)
}

func TestNewConfig_NonPositiveHTTPTimeout_Fails(t *testing.T) {
	_, err := NewConfig("app", "https://toggles.example.com", "sk_abc123", WithHTTPTimeout(-1*time.Second))
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrInvalidConfig))
}

func TestNewConfig_WithOfflineModeDisabled(t *testing.T) {
	cfg, err := NewConfig("app", "https://toggles.example.com", "sk_abc123", WithOfflineMode(false))
	require.NoError(t, err)
	assert.False(t, cfg.EnableOfflineMode)
}

func TestNewConfig_WithTimeZone(t *testing.T) {
	loc, err := time.LoadLocation("America/Sao_Paulo")
	require.NoError(t, err)

	cfg, err := NewConfig("app", "https://toggles.example.com", "sk_abc123", WithTimeZone(loc))
	require.NoError(t, err)
	assert.Equal(t, loc, cfg.TimeZone)
}

func TestNewConfig_WithHTTPClient(t *testing.T) {
	custom := &http.Client{Timeout: 42 * time.Second}
	cfg, err := NewConfig("app", "https://toggles.example.com", "sk_abc123", WithHTTPClient(custom))
	require.NoError(t, err)
	assert.Same(t, custom, cfg.HTTPClient)
}
