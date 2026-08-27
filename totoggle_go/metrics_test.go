package totoggle

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
)

type recordingSuccessListener struct{ counts []int }

func (r *recordingSuccessListener) OnRefreshSuccess(toggleCount int) {
	r.counts = append(r.counts, toggleCount)
}

type recordingFailureListener struct {
	errs     []error
	failures []int
}

func (r *recordingFailureListener) OnRefreshFailure(err error, consecutiveFailures int) {
	r.errs = append(r.errs, err)
	r.failures = append(r.failures, consecutiveFailures)
}

type recordingEvaluationListener struct {
	paths   []string
	results []bool
}

func (r *recordingEvaluationListener) OnEvaluation(path string, result bool) {
	r.paths = append(r.paths, path)
	r.results = append(r.results, result)
}

// A listener implementing all three interfaces at once must be dispatched by every one of them.
type allThreeListener struct {
	recordingSuccessListener
	recordingFailureListener
	recordingEvaluationListener
}

func TestMetricsRegistry_AddMetricsListener_RegistersOnlyImplementedInterfaces(t *testing.T) {
	reg := newMetricsRegistry()
	success := &recordingSuccessListener{}
	reg.add(success)

	reg.notifyRefreshSuccess(3)
	reg.notifyRefreshFailure(errors.New("boom"), 1)
	reg.notifyEvaluation("t1", true)

	assert.Equal(t, []int{3}, success.counts)
}

func TestMetricsRegistry_DispatchesToAllThreeWhenAllImplemented(t *testing.T) {
	reg := newMetricsRegistry()
	l := &allThreeListener{}
	reg.add(l)

	reg.notifyRefreshSuccess(5)
	reg.notifyRefreshFailure(errors.New("boom"), 2)
	reg.notifyEvaluation("t1.t2", false)

	assert.Equal(t, []int{5}, l.recordingSuccessListener.counts)
	assert.Equal(t, []int{2}, l.recordingFailureListener.failures)
	assert.Equal(t, []string{"t1.t2"}, l.recordingEvaluationListener.paths)
	assert.Equal(t, []bool{false}, l.recordingEvaluationListener.results)
}

type panickingListener struct{}

func (panickingListener) OnEvaluation(path string, result bool) { panic("listener bug") }

// A broken listener must never take down evaluation or the refresh loop.
func TestMetricsRegistry_PanickingListenerDoesNotPropagate(t *testing.T) {
	reg := newMetricsRegistry()
	reg.add(panickingListener{})
	good := &recordingEvaluationListener{}
	reg.add(good)

	assert.NotPanics(t, func() {
		reg.notifyEvaluation("t1", true)
	})
	assert.Equal(t, []string{"t1"}, good.paths)
}

func TestMetricsRegistry_UnrelatedTypeRegistersForNothing(t *testing.T) {
	reg := newMetricsRegistry()
	reg.add("not a listener")

	assert.NotPanics(t, func() {
		reg.notifyRefreshSuccess(1)
		reg.notifyRefreshFailure(errors.New("x"), 1)
		reg.notifyEvaluation("t1", true)
	})
}
