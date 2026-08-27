// Package serverapi is the sole place that talks to the server's public secret-key API — the
// wire format lives here, nowhere else in this module makes an HTTP request.
package serverapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/manorfm/toToggles/totoggle_go/internal/toggle"
)

// ErrAuthentication is returned when the server rejects the secret key (401 or 404 — the server
// treats an unknown key as a plain 404, not a distinct auth error).
var ErrAuthentication = errors.New("serverapi: secret key rejected by server")

// Fetcher fetches the full toggle set for one application from GET <url> using the X-API-Key
// header. url is the full endpoint (e.g. "https://host/api/toggles"), assembled once by the
// caller rather than re-joined on every fetch.
type Fetcher struct {
	httpClient *http.Client
	url        string
	secretKey  string
}

// NewFetcher builds a Fetcher. A nil httpClient defaults to http.DefaultClient.
func NewFetcher(httpClient *http.Client, url, secretKey string) *Fetcher {
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	return &Fetcher{httpClient: httpClient, url: url, secretKey: secretKey}
}

type fetchResponse struct {
	Application struct {
		Toggles []toggle.Toggle `json:"toggles"`
	} `json:"application"`
}

// Fetch retrieves and parses the current toggle set. The returned error never includes the
// secret key or the raw response body — only a sentinel or a status code — so a caller logging
// err.Error() can't leak the credential.
func (f *Fetcher) Fetch(ctx context.Context) (toggle.Application, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, f.url, nil)
	if err != nil {
		return toggle.Application{}, fmt.Errorf("serverapi: building request: %w", err)
	}
	req.Header.Set("X-API-Key", f.secretKey)

	resp, err := f.httpClient.Do(req)
	if err != nil {
		return toggle.Application{}, fmt.Errorf("serverapi: request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusNotFound {
		return toggle.Application{}, ErrAuthentication
	}
	if resp.StatusCode != http.StatusOK {
		return toggle.Application{}, fmt.Errorf("serverapi: unexpected status %d", resp.StatusCode)
	}

	var parsed fetchResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return toggle.Application{}, fmt.Errorf("serverapi: decoding response: %w", err)
	}

	return toggle.NewApplication(parsed.Application.Toggles), nil
}
