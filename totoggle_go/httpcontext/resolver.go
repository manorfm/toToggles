// Package httpcontext adapts net/http requests to ToToggle's lazy context resolver. Gin handlers
// use the same request context, so wrap the Gin engine with Middleware and call
// client.IsActiveContext(c.Request.Context(), path).
package httpcontext

import (
	"context"
	"net"
	"net/http"
	"strings"

	totoggle "github.com/manorfm/toToggles/totoggle_go"
)

type Options struct {
	// TrustedProxyAddresses accepts exact IPs or CIDRs.
	TrustedProxyAddresses []string
	CountryHeader         string
	Values                func(*http.Request) map[string]string
}

type Resolver struct{ options Options }

func New(options Options) *Resolver {
	if options.CountryHeader == "" {
		options.CountryHeader = "CF-IPCountry"
	}
	return &Resolver{options: options}
}

func (r *Resolver) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		next.ServeHTTP(w, req.WithContext(context.WithValue(req.Context(), contextKey{}, r.values(req))))
	})
}

func (r *Resolver) Resolve(ctx context.Context, key string) (string, bool) {
	values, ok := ctx.Value(contextKey{}).(map[string]string)
	if !ok {
		return "", false
	}
	value, ok := values[key]
	return value, ok && value != ""
}

type contextKey struct{}

func (r *Resolver) values(req *http.Request) map[string]string {
	values := map[string]string{}
	remote, _, _ := net.SplitHostPort(req.RemoteAddr)
	if remote == "" {
		remote = req.RemoteAddr
	}
	if ip := net.ParseIP(remote); ip != nil {
		values["ip"] = ip.String()
	}
	if r.trusted(remote) {
		if ip := net.ParseIP(strings.TrimSpace(strings.Split(req.Header.Get("X-Forwarded-For"), ",")[0])); ip != nil {
			values["ip"] = ip.String()
		}
		if country := strings.ToUpper(strings.TrimSpace(req.Header.Get(r.options.CountryHeader))); len(country) == 2 {
			values["country"] = country
		}
	}
	if r.options.Values != nil {
		for key, value := range r.options.Values(req) {
			if value != "" {
				values[key] = value
			}
		}
	}
	return values
}

func (r *Resolver) trusted(remote string) bool {
	peer := net.ParseIP(remote)
	for _, trusted := range r.options.TrustedProxyAddresses {
		if remote == trusted {
			return true
		}
		if peer != nil {
			if _, network, err := net.ParseCIDR(trusted); err == nil && network.Contains(peer) {
				return true
			}
		}
	}
	return false
}

var _ totoggle.ToggleContextResolver = (*Resolver)(nil)
