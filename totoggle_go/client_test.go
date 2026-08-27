package totoggle

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strconv"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// jsonServer serves a fixed toggles payload on every request, tracking how many times it was
// hit — used by tests that don't care about mid-test payload changes.
func jsonServer(t *testing.T, body string) (*httptest.Server, *int32) {
	t.Helper()
	var hits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return srv, &hits
}

func toggleJSON(id, path, value string, enabled bool, level int, parentID string, hasRule bool, ruleType, ruleValue string) string {
	parent := "null"
	if parentID != "" {
		parent = `"` + parentID + `"`
	}
	rule := "null"
	if hasRule {
		rule = `{"type":"` + ruleType + `","value":"` + ruleValue + `"}`
	}
	return `{"id":"` + id + `","path":"` + path + `","value":"` + value + `","enabled":` +
		strconv.FormatBool(enabled) + `,"level":` + strconv.Itoa(level) + `,"parent_id":` + parent +
		`,"app_id":"app-1","has_activation_rule":` + strconv.FormatBool(hasRule) + `,"activation_rule":` + rule + `}`
}

func applicationJSON(toggles ...string) string {
	body := `{"application":{"id":"app-1","name":"Test App","toggles":[`
	for i, tg := range toggles {
		if i > 0 {
			body += ","
		}
		body += tg
	}
	body += `]}}`
	return body
}

func newTestClient(t *testing.T, serverURL string, opts ...Option) *Client {
	t.Helper()
	cfg, err := NewConfig("test-app", serverURL, "sk_test123", opts...)
	require.NoError(t, err)
	return New(cfg)
}

func TestClient_Start_FetchesInitialDataSynchronously(t *testing.T) {
	srv, hits := jsonServer(t, applicationJSON(
		toggleJSON("t1", "user", "user", true, 0, "", false, "", ""),
	))
	client := newTestClient(t, srv.URL, WithRefreshInterval(time.Hour))
	require.NoError(t, client.Start(context.Background()))
	t.Cleanup(client.Shutdown)

	assert.Equal(t, int32(1), atomic.LoadInt32(hits))
	assert.True(t, client.IsActive("user"))
}

func TestClient_IsActive_BeforeStart_ReturnsFalse(t *testing.T) {
	client := newTestClient(t, "http://unused.invalid")
	assert.False(t, client.IsActive("user"))
}

func TestClient_IsActive_AfterShutdown_ReturnsFalse(t *testing.T) {
	srv, _ := jsonServer(t, applicationJSON(toggleJSON("t1", "user", "user", true, 0, "", false, "", "")))
	client := newTestClient(t, srv.URL, WithRefreshInterval(time.Hour))
	require.NoError(t, client.Start(context.Background()))

	client.Shutdown()

	assert.False(t, client.IsActive("user"))
}

func TestClient_IsActive_UnknownPath_ReturnsFalse(t *testing.T) {
	srv, _ := jsonServer(t, applicationJSON(toggleJSON("t1", "user", "user", true, 0, "", false, "", "")))
	client := newTestClient(t, srv.URL, WithRefreshInterval(time.Hour))
	require.NoError(t, client.Start(context.Background()))
	t.Cleanup(client.Shutdown)

	assert.False(t, client.IsActive("does.not.exist"))
}

func TestClient_IsActive_DisabledToggle_ReturnsFalse(t *testing.T) {
	srv, _ := jsonServer(t, applicationJSON(toggleJSON("t1", "user", "user", false, 0, "", false, "", "")))
	client := newTestClient(t, srv.URL, WithRefreshInterval(time.Hour))
	require.NoError(t, client.Start(context.Background()))
	t.Cleanup(client.Shutdown)

	assert.False(t, client.IsActive("user"))
}

// The user's own t1.t2.t3 hierarchy example: a disabled ancestor blocks every descendant, even
// though the descendant itself is enabled.
func TestClient_IsActive_DisabledAncestorBlocksDescendant(t *testing.T) {
	srv, _ := jsonServer(t, applicationJSON(
		toggleJSON("1", "t1", "t1", false, 0, "", false, "", ""),
		toggleJSON("2", "t1.t2", "t2", true, 1, "1", false, "", ""),
		toggleJSON("3", "t1.t2.t3", "t3", true, 2, "2", false, "", ""),
	))
	client := newTestClient(t, srv.URL, WithRefreshInterval(time.Hour))
	require.NoError(t, client.Start(context.Background()))
	t.Cleanup(client.Shutdown)

	assert.False(t, client.IsActive("t1.t2.t3"))
	assert.False(t, client.IsActive("t1.t2"))
	assert.False(t, client.IsActive("t1"))
}

func TestClient_IsActive_AllAncestorsEnabledNoRules_ReturnsTrue(t *testing.T) {
	srv, _ := jsonServer(t, applicationJSON(
		toggleJSON("1", "t1", "t1", true, 0, "", false, "", ""),
		toggleJSON("2", "t1.t2", "t2", true, 1, "1", false, "", ""),
		toggleJSON("3", "t1.t2.t3", "t3", true, 2, "2", false, "", ""),
	))
	client := newTestClient(t, srv.URL, WithRefreshInterval(time.Hour))
	require.NoError(t, client.Start(context.Background()))
	t.Cleanup(client.Shutdown)

	assert.True(t, client.IsActive("t1.t2.t3"))
}

// Regression coverage for the exact bug fixed in the Kotlin client this session: the parameter
// passed to IsActiveFor must be forwarded to EVERY ancestor's rule evaluation, not just the
// target's — an ancestor rule evaluated with no parameter used to always fail closed regardless
// of what the caller passed in.
func TestClient_IsActiveFor_ForwardsParameterToAncestorRule(t *testing.T) {
	srv, _ := jsonServer(t, applicationJSON(
		toggleJSON("1", "t1", "t1", true, 0, "", true, "parameter", "premium,enterprise"),
		toggleJSON("2", "t1.t2", "t2", true, 1, "1", false, "", ""),
	))
	client := newTestClient(t, srv.URL, WithRefreshInterval(time.Hour))
	require.NoError(t, client.Start(context.Background()))
	t.Cleanup(client.Shutdown)

	assert.True(t, client.IsActiveFor("t1.t2", "premium"))
	assert.False(t, client.IsActiveFor("t1.t2", "basic"))
	assert.False(t, client.IsActive("t1.t2")) // no parameter at all: the ancestor rule can never match
}

func TestClient_IsActiveFor_TargetsOwnRule(t *testing.T) {
	srv, _ := jsonServer(t, applicationJSON(
		toggleJSON("1", "user", "user", true, 0, "", true, "country", "BR,US"),
	))
	client := newTestClient(t, srv.URL, WithRefreshInterval(time.Hour))
	require.NoError(t, client.Start(context.Background()))
	t.Cleanup(client.Shutdown)

	assert.True(t, client.IsActiveFor("user", "BR"))
	assert.False(t, client.IsActiveFor("user", "FR"))
}

func TestClient_IsActiveFor_PercentageRuleIsDeterministicPerKey(t *testing.T) {
	srv, _ := jsonServer(t, applicationJSON(
		toggleJSON("1", "rollout", "rollout", true, 0, "", true, "percentage", "50"),
	))
	client := newTestClient(t, srv.URL, WithRefreshInterval(time.Hour))
	require.NoError(t, client.Start(context.Background()))
	t.Cleanup(client.Shutdown)

	first := client.IsActiveFor("rollout", "user-42")
	for i := 0; i < 10; i++ {
		assert.Equal(t, first, client.IsActiveFor("rollout", "user-42"))
	}
}

func TestClient_Refresh_ForcesAnImmediateFetch(t *testing.T) {
	srv, hits := jsonServer(t, applicationJSON(toggleJSON("1", "user", "user", true, 0, "", false, "", "")))
	client := newTestClient(t, srv.URL, WithRefreshInterval(time.Hour))
	require.NoError(t, client.Start(context.Background()))
	t.Cleanup(client.Shutdown)

	require.NoError(t, client.Refresh(context.Background()))
	assert.Equal(t, int32(2), atomic.LoadInt32(hits))
}

func TestClient_Refresh_BeforeStart_ReturnsErrNotStarted(t *testing.T) {
	client := newTestClient(t, "http://unused.invalid")
	err := client.Refresh(context.Background())
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrNotStarted)
}

func TestClient_Refresh_AfterShutdown_ReturnsErrAlreadyShutdown(t *testing.T) {
	srv, _ := jsonServer(t, applicationJSON(toggleJSON("1", "user", "user", true, 0, "", false, "", "")))
	client := newTestClient(t, srv.URL, WithRefreshInterval(time.Hour))
	require.NoError(t, client.Start(context.Background()))
	client.Shutdown()

	err := client.Refresh(context.Background())
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrAlreadyShutdown)
}

func TestClient_Refresh_PropagatesFetchError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	t.Cleanup(srv.Close)

	client := newTestClient(t, srv.URL, WithRefreshInterval(time.Hour))
	require.NoError(t, client.Start(context.Background())) // Start never fails on a bad initial fetch
	t.Cleanup(client.Shutdown)

	err := client.Refresh(context.Background())
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrAuthentication)
}

func TestClient_Start_TwiceIsIdempotent(t *testing.T) {
	srv, hits := jsonServer(t, applicationJSON(toggleJSON("1", "user", "user", true, 0, "", false, "", "")))
	client := newTestClient(t, srv.URL, WithRefreshInterval(time.Hour))
	require.NoError(t, client.Start(context.Background()))
	require.NoError(t, client.Start(context.Background()))
	t.Cleanup(client.Shutdown)

	assert.Equal(t, int32(1), atomic.LoadInt32(hits))
}

func TestClient_Start_AfterShutdown_ReturnsErrAlreadyShutdown(t *testing.T) {
	srv, _ := jsonServer(t, applicationJSON(toggleJSON("1", "user", "user", true, 0, "", false, "", "")))
	client := newTestClient(t, srv.URL, WithRefreshInterval(time.Hour))
	require.NoError(t, client.Start(context.Background()))
	client.Shutdown()

	err := client.Start(context.Background())
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrAlreadyShutdown)
}

func TestClient_Shutdown_TwiceIsSafe(t *testing.T) {
	srv, _ := jsonServer(t, applicationJSON(toggleJSON("1", "user", "user", true, 0, "", false, "", "")))
	client := newTestClient(t, srv.URL, WithRefreshInterval(time.Hour))
	require.NoError(t, client.Start(context.Background()))

	assert.NotPanics(t, func() {
		client.Shutdown()
		client.Shutdown()
	})
}

func TestClient_Shutdown_BeforeStart_IsSafe(t *testing.T) {
	client := newTestClient(t, "http://unused.invalid")
	assert.NotPanics(t, client.Shutdown)
}

func TestClient_BackgroundRefresh_RefetchesOnInterval(t *testing.T) {
	srv, hits := jsonServer(t, applicationJSON(toggleJSON("1", "user", "user", true, 0, "", false, "", "")))
	client := newTestClient(t, srv.URL, WithRefreshInterval(20*time.Millisecond))
	require.NoError(t, client.Start(context.Background()))
	t.Cleanup(client.Shutdown)

	require.Eventually(t, func() bool {
		return atomic.LoadInt32(hits) >= 3
	}, time.Second, 5*time.Millisecond)
}

func TestClient_IsHealthy_TrueAfterSuccessfulStart(t *testing.T) {
	srv, _ := jsonServer(t, applicationJSON(toggleJSON("1", "user", "user", true, 0, "", false, "", "")))
	client := newTestClient(t, srv.URL, WithRefreshInterval(time.Hour))
	require.NoError(t, client.Start(context.Background()))
	t.Cleanup(client.Shutdown)

	assert.True(t, client.IsHealthy())
	assert.False(t, client.IsStale())
}

func TestClient_IsHealthy_FalseBeforeStart(t *testing.T) {
	client := newTestClient(t, "http://unused.invalid")
	assert.False(t, client.IsHealthy())
}

func TestClient_IsHealthy_FalseWhenNeverSuccessfullyFetched(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)

	client := newTestClient(t, srv.URL, WithRefreshInterval(time.Hour))
	require.NoError(t, client.Start(context.Background()))
	t.Cleanup(client.Shutdown)

	assert.False(t, client.IsHealthy())
	assert.True(t, client.IsStale())
	assert.Equal(t, 1, client.ConsecutiveFailureCount())
	assert.Error(t, client.LastError())
	assert.False(t, client.LastErrorTime().IsZero())
}

func TestClient_AddMetricsListener_ObservesRefreshAndEvaluation(t *testing.T) {
	srv, _ := jsonServer(t, applicationJSON(toggleJSON("1", "user", "user", true, 0, "", false, "", "")))
	client := newTestClient(t, srv.URL, WithRefreshInterval(time.Hour))

	success := &recordingSuccessListener{}
	eval := &recordingEvaluationListener{}
	client.AddMetricsListener(success)
	client.AddMetricsListener(eval)

	require.NoError(t, client.Start(context.Background()))
	t.Cleanup(client.Shutdown)

	client.IsActive("user")

	assert.Equal(t, []int{1}, success.counts)
	assert.Equal(t, []string{"user"}, eval.paths)
	assert.Equal(t, []bool{true}, eval.results)
}

func TestClient_AddMetricsListener_ObservesRefreshFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)

	client := newTestClient(t, srv.URL, WithRefreshInterval(time.Hour))
	failure := &recordingFailureListener{}
	client.AddMetricsListener(failure)

	require.NoError(t, client.Start(context.Background()))
	t.Cleanup(client.Shutdown)

	require.Len(t, failure.errs, 1)
	assert.Equal(t, []int{1}, failure.failures)
}
