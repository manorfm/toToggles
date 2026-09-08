package httpcontext

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestResolver_IgnoresForwardedHeadersFromUntrustedPeer(t *testing.T) {
	resolver := New(Options{})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.8:443"
	req.Header.Set("X-Forwarded-For", "203.0.113.4")
	req.Header.Set("CF-IPCountry", "BR")
	resolver.Middleware(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
		ip, ok := resolver.Resolve(request.Context(), "ip")
		assert.True(t, ok)
		assert.Equal(t, "10.0.0.8", ip)
		_, country := resolver.Resolve(request.Context(), "country")
		assert.False(t, country)
	})).ServeHTTP(httptest.NewRecorder(), req)
}

func TestResolver_UsesTrustedProxyAndDomainValues(t *testing.T) {
	resolver := New(Options{TrustedProxyAddresses: []string{"10.0.0.8"}, Values: func(*http.Request) map[string]string { return map[string]string{"user_id": "u-1"} }})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.8:443"
	req.Header.Set("X-Forwarded-For", "203.0.113.4, 10.0.0.8")
	req.Header.Set("CF-IPCountry", "br")
	resolver.Middleware(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
		ip, _ := resolver.Resolve(request.Context(), "ip")
		country, _ := resolver.Resolve(request.Context(), "country")
		userID, _ := resolver.Resolve(request.Context(), "user_id")
		assert.Equal(t, "203.0.113.4", ip)
		assert.Equal(t, "BR", country)
		assert.Equal(t, "u-1", userID)
	})).ServeHTTP(httptest.NewRecorder(), req)
}

func TestResolver_TrustsForwardedHeadersForCIDRProxy(t *testing.T) {
	resolver := New(Options{TrustedProxyAddresses: []string{"10.0.0.0/24"}})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.8:443"
	req.Header.Set("X-Forwarded-For", "203.0.113.4")
	resolver.Middleware(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
		ip, ok := resolver.Resolve(request.Context(), "ip")
		assert.True(t, ok)
		assert.Equal(t, "203.0.113.4", ip)
	})).ServeHTTP(httptest.NewRecorder(), req)
}

func TestResolver_UsesRFC7239ForwardedForTrustedIPv6CIDRProxy(t *testing.T) {
	resolver := New(Options{TrustedProxyAddresses: []string{"2001:db8:feed::/48"}})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "[2001:db8:feed::8]:443"
	req.Header.Set("Forwarded", `for="[2001:db8:cafe::4]:8443";proto=https, for=198.51.100.8`)
	req.Header.Set("X-Forwarded-For", "203.0.113.4")

	resolver.Middleware(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
		ip, ok := resolver.Resolve(request.Context(), "ip")
		assert.True(t, ok)
		assert.Equal(t, "2001:db8:cafe::4", ip)
	})).ServeHTTP(httptest.NewRecorder(), req)
}

func TestResolver_FallsBackToTrustedXForwardedForWhenForwardedIsInvalid(t *testing.T) {
	resolver := New(Options{TrustedProxyAddresses: []string{"2001:db8:feed::8"}})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "[2001:db8:feed::8]:443"
	req.Header.Set("Forwarded", "for=_hidden")
	req.Header.Set("X-Forwarded-For", "2001:db8:cafe::4")

	resolver.Middleware(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
		ip, ok := resolver.Resolve(request.Context(), "ip")
		assert.True(t, ok)
		assert.Equal(t, "2001:db8:cafe::4", ip)
	})).ServeHTTP(httptest.NewRecorder(), req)
}

func TestResolver_RejectsForwardedFromUntrustedIPv6Peer(t *testing.T) {
	resolver := New(Options{TrustedProxyAddresses: []string{"2001:db8:feed::/48"}})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "[2001:db8:beef::8]:443"
	req.Header.Set("Forwarded", "for=2001:db8:cafe::4")
	req.Header.Set("X-Forwarded-For", "203.0.113.4")

	resolver.Middleware(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
		ip, ok := resolver.Resolve(request.Context(), "ip")
		assert.True(t, ok)
		assert.Equal(t, "2001:db8:beef::8", ip)
	})).ServeHTTP(httptest.NewRecorder(), req)
}
