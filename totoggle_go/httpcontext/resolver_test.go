package httpcontext

import (
	"net"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestResolver_UsesTrustedCountryHeaderBeforeLocalResolver(t *testing.T) {
	called := false
	resolver := New(Options{
		TrustedProxyAddresses: []string{"10.0.0.8"},
		CountryResolver: func(net.IP) (string, bool) {
			called = true
			return "US", true
		},
	})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.8:443"
	req.Header.Set("X-Forwarded-For", "203.0.113.4")
	req.Header.Set("CF-IPCountry", "br")

	resolver.Middleware(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
		country, ok := resolver.Resolve(request.Context(), "country")
		assert.True(t, ok)
		assert.Equal(t, "BR", country)
		assert.False(t, called)
	})).ServeHTTP(httptest.NewRecorder(), req)
}

func TestResolver_UsesLocalCountryResolverForEffectiveClientIP(t *testing.T) {
	var resolved net.IP
	resolver := New(Options{
		TrustedProxyAddresses: []string{"10.0.0.8"},
		CountryResolver: func(ip net.IP) (string, bool) {
			resolved = ip
			return "br", true
		},
	})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.8:443"
	req.Header.Set("Forwarded", "for=203.0.113.4")

	resolver.Middleware(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
		country, ok := resolver.Resolve(request.Context(), "country")
		assert.True(t, ok)
		assert.Equal(t, "BR", country)
		assert.Equal(t, net.ParseIP("203.0.113.4"), resolved)
	})).ServeHTTP(httptest.NewRecorder(), req)
}

func TestResolver_UsesLocalCountryResolverForDirectClient(t *testing.T) {
	resolver := New(Options{CountryResolver: func(ip net.IP) (string, bool) {
		if ip.Equal(net.ParseIP("203.0.113.4")) {
			return "pt", true
		}
		return "", false
	}})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "203.0.113.4:443"
	req.Header.Set("CF-IPCountry", "BR")

	resolver.Middleware(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
		country, ok := resolver.Resolve(request.Context(), "country")
		assert.True(t, ok)
		assert.Equal(t, "PT", country)
	})).ServeHTTP(httptest.NewRecorder(), req)
}

func TestResolver_FailsClosedWhenCountrySourcesAreDisabledOrInvalid(t *testing.T) {
	resolver := New(Options{CountryResolver: func(net.IP) (string, bool) { return "B1", true }})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "203.0.113.4:443"

	resolver.Middleware(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
		_, ok := resolver.Resolve(request.Context(), "country")
		assert.False(t, ok)
	})).ServeHTTP(httptest.NewRecorder(), req)

	disabled := New(Options{})
	disabled.Middleware(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
		_, ok := disabled.Resolve(request.Context(), "country")
		assert.False(t, ok)
	})).ServeHTTP(httptest.NewRecorder(), req)
}

func TestResolver_FailsClosedWhenCountryResolverPanics(t *testing.T) {
	resolver := New(Options{CountryResolver: func(net.IP) (string, bool) {
		panic("GeoIP unavailable")
	}})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "203.0.113.4:443"

	assert.NotPanics(t, func() {
		resolver.Middleware(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
			_, ok := resolver.Resolve(request.Context(), "country")
			assert.False(t, ok)
		})).ServeHTTP(httptest.NewRecorder(), req)
	})
}

func TestResolver_DoesNotAllowApplicationValuesToOverrideNetworkContext(t *testing.T) {
	resolver := New(Options{
		Values: func(*http.Request) map[string]string {
			return map[string]string{"ip": "203.0.113.9", "country": "BR", "user_id": "u-1"}
		},
	})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "203.0.113.4:443"

	resolver.Middleware(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
		ip, ipOK := resolver.Resolve(request.Context(), "ip")
		assert.True(t, ipOK)
		assert.Equal(t, "203.0.113.4", ip)
		_, countryOK := resolver.Resolve(request.Context(), "country")
		assert.False(t, countryOK)
		userID, userIDOK := resolver.Resolve(request.Context(), "user_id")
		assert.True(t, userIDOK)
		assert.Equal(t, "u-1", userID)
	})).ServeHTTP(httptest.NewRecorder(), req)
}

func TestResolver_FailsClosedWhenApplicationValuesPanics(t *testing.T) {
	resolver := New(Options{Values: func(*http.Request) map[string]string {
		panic("identity provider unavailable")
	}})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "203.0.113.4:443"

	assert.NotPanics(t, func() {
		resolver.Middleware(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
			ip, ok := resolver.Resolve(request.Context(), "ip")
			assert.True(t, ok)
			assert.Equal(t, "203.0.113.4", ip)
			_, ok = resolver.Resolve(request.Context(), "user_id")
			assert.False(t, ok)
		})).ServeHTTP(httptest.NewRecorder(), req)
	})
}

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
