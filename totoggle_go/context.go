package totoggle

import "context"

// ToggleContext is request/deployment information used only by the rule on the requested
// toggle. Applications populate it through ToggleContextProvider; the SDK never guesses HTTP
// headers, proxy addresses, or authentication state.
type ToggleContext struct {
	RolloutKey string
	Parameter  string
	UserID     string
	IP         string
	Country    string
	Cohort     string
	Attributes map[string]string
}

// ToggleContextProvider bridges an application's middleware/request context to ToToggle.
// Returning nil means no context is available and contextual rules fail closed.
type ToggleContextProvider interface {
	ToggleContext(context.Context) *ToggleContext
}
