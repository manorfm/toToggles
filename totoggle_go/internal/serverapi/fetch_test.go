package serverapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/manorfm/toToggles/totoggle_go/internal/toggle"
)

func mustPath(t *testing.T, raw string) toggle.Path {
	t.Helper()
	p, err := toggle.NewPath(raw)
	require.NoError(t, err)
	return p
}

func TestFetcher_Fetch_SendsSecretKeyHeaderAndParsesToggles(t *testing.T) {
	var gotHeader string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotHeader = r.Header.Get("X-API-Key")
		assert.Equal(t, http.MethodGet, r.Method)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"application": {
				"id": "app-1",
				"name": "Checkout Web",
				"toggles": [
					{"id": "t1", "path": "user", "value": "user", "enabled": true, "level": 0,
					 "parent_id": null, "app_id": "app-1", "has_activation_rule": false, "activation_rule": null},
					{"id": "t2", "path": "user.payments", "value": "payments", "enabled": true, "level": 1,
					 "parent_id": "t1", "app_id": "app-1", "has_activation_rule": true,
					 "activation_rule": {"type": "percentage", "value": "50"}}
				]
			}
		}`))
	}))
	defer srv.Close()

	fetcher := NewFetcher(nil, srv.URL, "sk_test123")
	app, err := fetcher.Fetch(context.Background())

	require.NoError(t, err)
	assert.Equal(t, "sk_test123", gotHeader)
	require.Len(t, app.Toggles, 2)

	t2, ok := app.ByPath(mustPath(t, "user.payments"))
	require.True(t, ok)
	require.NotNil(t, t2.ActivationRule)
	assert.Equal(t, "50", t2.ActivationRule.Value)
}

func TestFetcher_Fetch_UnauthorizedReturnsErrAuthentication(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	fetcher := NewFetcher(nil, srv.URL, "sk_bad")
	_, err := fetcher.Fetch(context.Background())

	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrAuthentication))
}

// A secret key rejection must never appear verbatim in the returned error — only the sentinel,
// so a caller who logs err.Error() can't leak the key into their own logs.
func TestFetcher_Fetch_ErrorNeverLeaksTheSecretKey(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()

	fetcher := NewFetcher(nil, srv.URL, "sk_supersecret")
	_, err := fetcher.Fetch(context.Background())

	require.Error(t, err)
	assert.NotContains(t, err.Error(), "sk_supersecret")
}

func TestFetcher_Fetch_ServerErrorStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	fetcher := NewFetcher(nil, srv.URL, "sk_test")
	_, err := fetcher.Fetch(context.Background())
	require.Error(t, err)
}

func TestFetcher_Fetch_MalformedJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`not json`))
	}))
	defer srv.Close()

	fetcher := NewFetcher(nil, srv.URL, "sk_test")
	_, err := fetcher.Fetch(context.Background())
	require.Error(t, err)
}

func TestFetcher_Fetch_RespectsContextCancellation(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(50 * time.Millisecond)
	}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Millisecond)
	defer cancel()

	fetcher := NewFetcher(nil, srv.URL, "sk_test")
	_, err := fetcher.Fetch(ctx)
	require.Error(t, err)
}
