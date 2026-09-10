package strategy

import (
	"net"
	"strings"

	"github.com/manorfm/toToggles/totoggle_go/internal/toggle"
)

// IPEvaluator matches a candidate IPv4 or IPv6 address against a comma-separated allowlist of
// exact addresses and/or CIDR ranges (e.g. "10.0.0.0/24" or "2001:db8::/32"). Uses
// net.ParseIP/net.ParseCIDR (never a DNS-resolving lookup), so a
// malformed or hostname-shaped candidate can never trigger a network call during evaluation.
type IPEvaluator struct{}

func (IPEvaluator) Evaluate(rule toggle.ActivationRule, key string, hasKey bool) bool {
	if !hasKey {
		return false
	}
	if strings.TrimSpace(rule.Value) == "" {
		return false
	}

	candidate := net.ParseIP(key)
	if candidate == nil {
		return false
	}
	for _, entry := range strings.Split(rule.Value, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		if matchesIPEntry(entry, candidate) {
			return true
		}
	}
	return false
}

func matchesIPEntry(entry string, candidate net.IP) bool {
	if strings.Contains(entry, "/") {
		_, network, err := net.ParseCIDR(entry)
		if err != nil {
			return false
		}
		return network.Contains(candidate)
	}
	exact := net.ParseIP(entry)
	if exact == nil {
		return false
	}
	return exact.Equal(candidate)
}
