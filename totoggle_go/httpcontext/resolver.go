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
	// CountryHeader is read only from an explicitly trusted proxy. It defaults to CF-IPCountry.
	CountryHeader string
	// CountryResolver performs local GeoIP resolution from the effective client IP. It is optional;
	// when neither a trusted header nor this resolver supplies a valid country, country rules fail closed.
	CountryResolver CountryResolver
	// ApplicationValues supplies authenticated, application-owned request values. Network-owned ip
	// and country always come from the resolver and cannot be supplied here.
	ApplicationValues ApplicationValuesResolver
}

// ApplicationValues is the complete canonical application context. Populate it from trusted
// authentication and deployment state, never from unvalidated request headers or query values.
// Attributes are exposed as attributes.<name>; empty attribute names are ignored.
type ApplicationValues struct {
	UserID     string
	RolloutKey string
	Cohort     string
	Attributes map[string]string
}

// ApplicationValuesResolver extracts immutable-for-evaluation application context for one HTTP
// request. The resolver copies its values into a request-local context before the next handler.
type ApplicationValuesResolver func(*http.Request) ApplicationValues

// CountryResolver isolates optional GeoIP implementations from HTTP extraction. It must not make
// network calls while evaluating a request.
type CountryResolver func(net.IP) (string, bool)

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
	clientIP := net.ParseIP(remote)
	if clientIP != nil {
		values["ip"] = clientIP.String()
	}
	if r.trusted(remote) {
		if ip, ok := forwardedIP(req.Header.Get("Forwarded")); ok {
			clientIP = net.ParseIP(ip)
			values["ip"] = clientIP.String()
		} else if ip, ok := xForwardedForIP(req.Header.Get("X-Forwarded-For")); ok {
			clientIP = ip
			values["ip"] = clientIP.String()
		}
		if country, ok := normalizeCountry(req.Header.Get(r.options.CountryHeader)); ok {
			values["country"] = country
		}
	}
	if _, found := values["country"]; !found && r.options.CountryResolver != nil && clientIP != nil {
		if country, ok := r.resolveCountry(clientIP); ok {
			values["country"] = country
		}
	}
	if r.options.ApplicationValues != nil {
		applicationValues := r.applicationValues(req)
		setApplicationValue(values, "user_id", applicationValues.UserID)
		setApplicationValue(values, "rollout_key", applicationValues.RolloutKey)
		setApplicationValue(values, "cohort", applicationValues.Cohort)
		for name, value := range applicationValues.Attributes {
			if name != "" {
				setApplicationValue(values, "attributes."+name, value)
			}
		}
	}
	return values
}

func setApplicationValue(values map[string]string, key, value string) {
	if value != "" {
		values[key] = value
	}
}

func (r *Resolver) applicationValues(req *http.Request) (values ApplicationValues) {
	defer func() {
		if recover() != nil {
			values = ApplicationValues{}
		}
	}()
	if r.options.ApplicationValues == nil {
		return ApplicationValues{}
	}
	return r.options.ApplicationValues(req)
}

func (r *Resolver) resolveCountry(ip net.IP) (country string, ok bool) {
	defer func() {
		if recover() != nil {
			country, ok = "", false
		}
	}()
	country, ok = r.options.CountryResolver(ip)
	if !ok {
		return "", false
	}
	return normalizeCountry(country)
}

func normalizeCountry(value string) (string, bool) {
	value = strings.TrimSpace(value)
	if len(value) != 2 {
		return "", false
	}
	for i := range value {
		if (value[i] < 'A' || value[i] > 'Z') && (value[i] < 'a' || value[i] > 'z') {
			return "", false
		}
	}
	return strings.ToUpper(value), true
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
	for _, directive := range strings.Split(first, ";") {
		name, value, found := strings.Cut(directive, "=")
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
