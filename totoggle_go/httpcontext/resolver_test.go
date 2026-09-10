package httpcontext

import (
	"net"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/manorfm/toToggles/totoggle_go/internal/strategy"
	"github.com/manorfm/toToggles/totoggle_go/internal/toggle"
)

func TestResolver_ProvidesOnlyCanonicalApplicationValues(t *testing.T) {
	resolver := New(Options{
		ApplicationValues: func(*http.Request) ApplicationValues {
			return ApplicationValues{
				UserID:     "user-42",
				RolloutKey: "account-7",
				Cohort:     "beta",
				Attributes: map[string]string{"plan": "pro", "": "ignored"},
			}
		},
	})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "203.0.113.4:443"

	resolver.Middleware(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
		for key, want := range map[string]string{
			"user_id":         "user-42",
			"rollout_key":     "account-7",
			"cohort":          "beta",
			"attributes.plan": "pro",
		} {
			got, ok := resolver.Resolve(request.Context(), key)
			assert.True(t, ok, key)
			assert.Equal(t, want, got)
		}
		_, ok := resolver.Resolve(request.Context(), "attributes.")
		assert.False(t, ok)
	})).ServeHTTP(httptest.NewRecorder(), req)
}

func TestResolver_IsolatesApplicationValuesBetweenConcurrentRequests(t *testing.T) {
	resolver := New(Options{
		ApplicationValues: func(request *http.Request) ApplicationValues {
			return ApplicationValues{
				UserID:     request.Header.Get("X-Authenticated-User"),
				RolloutKey: request.Header.Get("X-Rollout-Key"),
				Cohort:     request.Header.Get("X-Deployment-Cohort"),
				Attributes: map[string]string{"plan": request.Header.Get("X-Account-Plan")},
			}
		},
	})

	ready := make(chan struct{}, 2)
	release := make(chan struct{})
	errs := make(chan string, 2)
	handler := resolver.Middleware(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
		ready <- struct{}{}
		<-release
		for key, want := range map[string]string{
			"user_id":         request.Header.Get("X-Authenticated-User"),
			"rollout_key":     request.Header.Get("X-Rollout-Key"),
			"cohort":          request.Header.Get("X-Deployment-Cohort"),
			"attributes.plan": request.Header.Get("X-Account-Plan"),
		} {
			got, ok := resolver.Resolve(request.Context(), key)
			if !ok || got != want {
				errs <- key
				return
			}
		}
	}))

	requests := []*http.Request{
		requestWithDomainValues("user-a", "account-a", "beta", "pro"),
		requestWithDomainValues("user-b", "account-b", "stable", "free"),
	}
	var requestsWG sync.WaitGroup
	for _, request := range requests {
		requestsWG.Add(1)
		go func(request *http.Request) {
			defer requestsWG.Done()
			handler.ServeHTTP(httptest.NewRecorder(), request)
		}(request)
	}
	<-ready
	<-ready
	close(release)
	requestsWG.Wait()
	close(errs)
	assert.Empty(t, errs)
}

func requestWithDomainValues(userID, rolloutKey, cohort, plan string) *http.Request {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "203.0.113.4:443"
	req.Header.Set("X-Authenticated-User", userID)
	req.Header.Set("X-Rollout-Key", rolloutKey)
	req.Header.Set("X-Deployment-Cohort", cohort)
	req.Header.Set("X-Account-Plan", plan)
	return req
}

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
		ApplicationValues: func(*http.Request) ApplicationValues {
			return ApplicationValues{UserID: "u-1"}
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
	resolver := New(Options{ApplicationValues: func(*http.Request) ApplicationValues {
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
	resolver := New(Options{TrustedProxyAddresses: []string{"10.0.0.8"}, ApplicationValues: func(*http.Request) ApplicationValues { return ApplicationValues{UserID: "u-1"} }})
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
		assert.True(t, strategy.IPEvaluator{}.Evaluate(
			toggle.ActivationRule{Value: "2001:db8:cafe::/64"}, ip, ok,
		))
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
