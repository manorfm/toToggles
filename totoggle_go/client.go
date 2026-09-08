package totoggle

import (
	"context"
	"log"
	"sync/atomic"
	"time"

	"github.com/manorfm/toToggles/totoggle_go/internal/cache"
	"github.com/manorfm/toToggles/totoggle_go/internal/serverapi"
	"github.com/manorfm/toToggles/totoggle_go/internal/strategy"
	"github.com/manorfm/toToggles/totoggle_go/internal/toggle"
)

// staleThresholdIntervals: the cache is considered stale once this many refresh intervals have
// passed with no successful update — e.g. with the default 5-minute interval, no successful
// refresh in 10 minutes. Only actually reachable under EnableOfflineMode, since otherwise a
// failing refresh already surfaces loudly via IsHealthy/LastError.
const staleThresholdIntervals = 2

// Client is the ToToggle feature-flag client: it fetches the toggle set for one application via
// a secret key, caches it in memory, and evaluates IsActive/IsActiveFor entirely from that cache
// — no network access on the evaluation hot path.
type Client struct {
	cfg      *Config
	fetcher  *serverapi.Fetcher
	cache    *cache.Cache
	registry *strategy.Registry
	metrics  *metricsRegistry

	started  atomic.Bool
	shutdown atomic.Bool

	stopRefresh chan struct{}
	refreshDone chan struct{}
}

// New builds a Client from an already-validated Config (see NewConfig). Call Start before using
// it — IsActive/IsActiveFor fail closed to false until then.
func New(cfg *Config) *Client {
	return &Client{
		cfg:      cfg,
		fetcher:  serverapi.NewFetcher(cfg.httpClient(), cfg.apiURL(), cfg.SecretKey),
		cache:    cache.New(),
		registry: newStrategyRegistry(cfg.TimeZone),
		metrics:  newMetricsRegistry(),
	}
}

// newStrategyRegistry registers one Evaluator per activation-rule type the server supports.
func newStrategyRegistry(zone *time.Location) *strategy.Registry {
	reg := strategy.NewRegistry()

	matchList := strategy.MatchListEvaluator{}
	reg.Register(toggle.RuleTypeParameter, matchList)
	reg.Register(toggle.RuleTypeUserID, matchList)
	reg.Register(toggle.RuleTypeCountry, matchList)
	reg.Register(toggle.RuleTypeCanary, matchList)

	reg.Register(toggle.RuleTypePercentage, strategy.NewPercentageEvaluator(nil))
	reg.Register(toggle.RuleTypeIP, strategy.IPEvaluator{})
	reg.Register(toggle.RuleTypeTime, strategy.NewTimeWindowEvaluator(func() time.Time {
		return time.Now().In(zone)
	}))

	return reg
}

// Start performs the initial toggle fetch and begins the background refresh loop. A failed
// initial fetch does not fail Start — the client comes up with an empty cache and reports itself
// unhealthy (see IsHealthy) until a refresh succeeds; this mirrors EnableOfflineMode's "keep
// going without the server" intent from the very first fetch, not just later ones. Calling Start
// again after it already succeeded is a no-op. Calling it after Shutdown returns
// ErrAlreadyShutdown.
func (c *Client) Start(ctx context.Context) error {
	if c.shutdown.Load() {
		return ErrAlreadyShutdown
	}
	if !c.started.CompareAndSwap(false, true) {
		return nil
	}

	_ = c.refreshOnce(ctx)

	c.stopRefresh = make(chan struct{})
	c.refreshDone = make(chan struct{})
	go c.refreshLoop()

	return nil
}

func (c *Client) refreshLoop() {
	defer close(c.refreshDone)
	ticker := time.NewTicker(c.cfg.RefreshInterval)
	defer ticker.Stop()
	for {
		select {
		case <-c.stopRefresh:
			return
		case <-ticker.C:
			ctx, cancel := context.WithTimeout(context.Background(), c.cfg.HTTPTimeout)
			_ = c.refreshOnce(ctx)
			cancel()
		}
	}
}

func (c *Client) refreshOnce(ctx context.Context) error {
	app, err := c.fetcher.Fetch(ctx)
	if err != nil {
		c.cache.RecordFailure(err)
		c.metrics.notifyRefreshFailure(err, c.cache.Stats().ConsecutiveFailures)
		return err
	}
	c.cache.Update(app)
	c.metrics.notifyRefreshSuccess(len(app.Toggles))
	return nil
}

// Refresh forces an immediate fetch, bypassing the refresh interval, and reports whether it
// succeeded — unlike the background loop (which only records failures for the observability
// getters), a caller explicitly asking for fresh data now gets a real error back on failure.
func (c *Client) Refresh(ctx context.Context) error {
	if err := c.requireUsable(); err != nil {
		return err
	}
	return c.refreshOnce(ctx)
}

func (c *Client) requireUsable() error {
	if c.shutdown.Load() {
		return ErrAlreadyShutdown
	}
	if !c.started.Load() {
		return ErrNotStarted
	}
	return nil
}

// IsActive reports whether the toggle at path is active, with no parameter for rule evaluation.
// Implements cascading validation: every ancestor on the path from root to target must be
// enabled and pass its own activation rule (if any), then the target itself must be enabled and
// pass its own rule (if any). A toggle that doesn't exist, or a client that isn't started (or
// has been shut down), fails closed to false.
func (c *Client) IsActive(path string) (active bool) {
	return c.IsActiveContext(context.Background(), path)
}

// IsActiveContext evaluates path with the application's request context. Middleware can attach
// request-specific values for the configured ToggleContextProvider without a separate argument
// for every rule field. It always fails closed and never panics.
func (c *Client) IsActiveContext(ctx context.Context, path string) (active bool) {
	defer func() {
		if recovered := recover(); recovered != nil {
			log.Printf("totoggle: isActive(%q) panicked; failing closed: %v", path, recovered)
			active = false
		}
	}()
	return c.evaluate(path, nil, ctx)
}

// IsActiveFor is retained for compatibility. Prefer WithToggleContextProvider; its legacy value
// is made available to every context field and rules never cascade from ancestors.
func (c *Client) IsActiveFor(path, parameter string) (active bool) {
	defer func() {
		if recovered := recover(); recovered != nil {
			log.Printf("totoggle: isActiveFor(%q) panicked; failing closed: %v", path, recovered)
			active = false
		}
	}()
	return c.evaluate(path, &ToggleContext{Parameter: parameter, RolloutKey: parameter, UserID: parameter, IP: parameter, Country: parameter, Cohort: parameter}, context.Background())
}

func (c *Client) evaluate(path string, legacyContext *ToggleContext, requestContext context.Context) bool {
	if !c.started.Load() || c.shutdown.Load() {
		return false
	}

	p, err := toggle.NewPath(path)
	if err != nil {
		return false
	}

	target, ancestors, ok := c.cache.Get(p)
	if !ok {
		c.metrics.notifyEvaluation(path, false)
		return false
	}

	result := c.evaluateAncestors(ancestors) &&
		target.Enabled &&
		c.evaluateRule(target, legacyContext, requestContext)

	c.metrics.notifyEvaluation(path, result)
	return result
}

func (c *Client) evaluateAncestors(ancestors []toggle.Toggle) bool {
	for _, ancestor := range ancestors {
		if !ancestor.Enabled {
			return false
		}
	}
	return true
}

// evaluateRule reports whether tg's activation rule matches, or true if it has none. A rule type
// with no registered Evaluator (a server-added type this client predates) fails closed to false,
// the same as every other malformed-rule case in this package.
func (c *Client) evaluateRule(tg toggle.Toggle, legacyContext *ToggleContext, requestContext context.Context) bool {
	if !tg.HasActivationRule || tg.ActivationRule == nil {
		return true
	}
	key, hasKey := c.contextKey(tg.ActivationRule.Type, legacyContext, tg.Path.String(), requestContext)
	if tg.ActivationRule.Type != toggle.RuleTypeTime && !hasKey {
		return false
	}
	result, _ := c.registry.Evaluate(*tg.ActivationRule, key, hasKey)
	return result
}

func (c *Client) contextKey(ruleType toggle.RuleType, legacyContext *ToggleContext, path string, requestContext context.Context) (string, bool) {
	ctx := legacyContext
	if ctx == nil && c.cfg.ContextProvider != nil {
		ctx = c.cfg.ContextProvider.ToggleContext(requestContext)
	}
	if ruleType == toggle.RuleTypeTime {
		return "", false
	}
	if ctx == nil {
		log.Printf("totoggle: rule type %q requires ToggleContextProvider; evaluation fails closed", ruleType)
		return "", false
	}
	var value string
	switch ruleType {
	case toggle.RuleTypePercentage:
		value = path + ":" + ctx.RolloutKey
	case toggle.RuleTypeParameter:
		value = ctx.Parameter
	case toggle.RuleTypeUserID:
		value = ctx.UserID
	case toggle.RuleTypeIP:
		value = ctx.IP
	case toggle.RuleTypeCountry:
		value = ctx.Country
	case toggle.RuleTypeCanary:
		value = ctx.Cohort
	}
	if value == "" || (ruleType == toggle.RuleTypePercentage && ctx.RolloutKey == "") {
		log.Printf("totoggle: rule type %q requires context that is absent; evaluation fails closed", ruleType)
	}
	if ruleType == toggle.RuleTypePercentage && ctx.RolloutKey == "" {
		return "", false
	}
	return value, value != ""
}

// IsHealthy reports whether the client is started, not shut down, has completed at least one
// successful refresh, and that data isn't stale (see IsStale).
func (c *Client) IsHealthy() bool {
	stats := c.cache.Stats()
	return c.started.Load() && !c.shutdown.Load() && !stats.LastSuccessAt.IsZero() && !c.isStale(stats)
}

// IsStale reports whether the cached data is older than expected — no successful refresh in
// more than staleThresholdIntervals times the configured RefreshInterval, or no successful
// refresh at all.
func (c *Client) IsStale() bool {
	return c.isStale(c.cache.Stats())
}

func (c *Client) isStale(stats cache.Stats) bool {
	if stats.LastSuccessAt.IsZero() {
		return true
	}
	return time.Since(stats.LastSuccessAt) > c.cfg.RefreshInterval*staleThresholdIntervals
}

// LastError returns the error from the most recent failed refresh, or nil if there hasn't been
// one (yet).
func (c *Client) LastError() error {
	return c.cache.Stats().LastError
}

// LastErrorTime returns when LastError last occurred, or the zero time if there hasn't been one.
func (c *Client) LastErrorTime() time.Time {
	return c.cache.Stats().LastErrorAt
}

// ConsecutiveFailureCount is how many refresh attempts have failed in a row, reset to 0 on the
// next success.
func (c *Client) ConsecutiveFailureCount() int {
	return c.cache.Stats().ConsecutiveFailures
}

// AddMetricsListener registers l under every one of RefreshSuccessListener/
// RefreshFailureListener/EvaluationListener that it implements. Safe to call before or after
// Start.
func (c *Client) AddMetricsListener(l any) {
	c.metrics.add(l)
}

// Shutdown stops the background refresh loop and releases the cached data. Idempotent — a
// second call is a no-op. Safe to call even if Start was never called.
func (c *Client) Shutdown() {
	if !c.shutdown.CompareAndSwap(false, true) {
		return
	}
	if c.stopRefresh != nil {
		close(c.stopRefresh)
		<-c.refreshDone
	}
	c.cache.Clear()
}
