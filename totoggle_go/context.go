package totoggle

import "context"

// ToggleContextResolver obtains only the key required by an activation rule. Middleware owns
// request extraction; the SDK never trusts HTTP headers, proxy addresses, or identity itself.
type ToggleContextResolver interface {
	Resolve(context.Context, string) (string, bool)
}
