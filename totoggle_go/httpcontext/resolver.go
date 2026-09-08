// Package httpcontext adapts net/http requests to ToToggle's lazy context resolver. Gin handlers
// use the same request context, so wrap the Gin engine with Middleware and call
// client.IsActiveContext(c.Request.Context(), path).
package httpcontext

import (
	"context"
	"net"
	"net/http"
	"strconv"
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
	remote := remoteAddress(req.RemoteAddr)
	if ip := net.ParseIP(remote); ip != nil {
		values["ip"] = ip.String()
	}
	if r.trusted(remote) {
		if ip, ok := forwardedIP(req.Header.Get("Forwarded")); ok {
			values["ip"] = ip
		} else if ip, ok := xForwardedForIP(req.Header.Get("X-Forwarded-For")); ok {
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

func remoteAddress(address string) string {
	host, _, err := net.SplitHostPort(address)
	if err == nil {
		return host
	}
	return address
}

// forwardedIP returns the client address from the first RFC 7239 Forwarded element.
// Obfuscated and malformed identifiers are intentionally ignored.
func forwardedIP(header string) (string, bool) {
	if header == "" {
		return "", false
	}
	first := strings.TrimSpace(strings.SplitN(header, ",", 2)[0])
	for _, parameter := range strings.Split(first, ";") {
		name, value, found := strings.Cut(parameter, "=")
		if !found || !strings.EqualFold(strings.TrimSpace(name), "for") {
			continue
		}
		value = strings.TrimSpace(value)
		if strings.HasPrefix(value, `"`) {
			unquoted, err := strconv.Unquote(value)
			if err != nil {
				return "", false
			}
			value = unquoted
		}
		return parseForwardedAddress(value)
	}
	return "", false
}

func parseForwardedAddress(value string) (string, bool) {
	if value == "" || strings.HasPrefix(value, "_") {
		return "", false
	}
	if ip := net.ParseIP(value); ip != nil {
		return ip.String(), true
	}
	if host, _, err := net.SplitHostPort(value); err == nil {
		if ip := net.ParseIP(host); ip != nil {
			return ip.String(), true
		}
	}
	if strings.HasPrefix(value, "[") && strings.HasSuffix(value, "]") {
		if ip := net.ParseIP(strings.TrimSuffix(strings.TrimPrefix(value, "["), "]")); ip != nil {
			return ip.String(), true
		}
	}
	return "", false
}

func xForwardedForIP(header string) (net.IP, bool) {
	first := strings.TrimSpace(strings.SplitN(header, ",", 2)[0])
	ip := net.ParseIP(first)
	return ip, ip != nil
}

func (r *Resolver) trusted(remote string) bool {
	peer := net.ParseIP(remote)
	for _, trusted := range r.options.TrustedProxyAddresses {
		if peer != nil && peer.Equal(net.ParseIP(trusted)) {
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
