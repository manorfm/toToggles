package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestLoginRateLimiter_AllowsUpToTheLimit(t *testing.T) {
	l := newLoginRateLimiter(3, time.Minute)

	assert.True(t, l.allow("1.2.3.4"))
	assert.True(t, l.allow("1.2.3.4"))
	assert.True(t, l.allow("1.2.3.4"))
	assert.False(t, l.allow("1.2.3.4"), "4th attempt within the window should be blocked")
}

func TestLoginRateLimiter_TracksEachKeyIndependently(t *testing.T) {
	l := newLoginRateLimiter(1, time.Minute)

	assert.True(t, l.allow("1.2.3.4"))
	assert.False(t, l.allow("1.2.3.4"))
	assert.True(t, l.allow("5.6.7.8"), "a different IP must have its own independent counter")
}

func TestLoginRateLimiter_ResetsAfterTheWindowElapses(t *testing.T) {
	l := newLoginRateLimiter(1, 10*time.Millisecond)

	assert.True(t, l.allow("1.2.3.4"))
	assert.False(t, l.allow("1.2.3.4"))

	time.Sleep(20 * time.Millisecond)
	assert.True(t, l.allow("1.2.3.4"), "a new window should allow attempts again")
}

func TestLoginRateLimiter_Reset_ClearsTheCounter(t *testing.T) {
	l := newLoginRateLimiter(1, time.Minute)

	assert.True(t, l.allow("1.2.3.4"))
	assert.False(t, l.allow("1.2.3.4"))

	l.reset("1.2.3.4")
	assert.True(t, l.allow("1.2.3.4"), "a reset counter should allow attempts again")
}

func TestLoginRateLimit_Middleware_BlocksAfterTheLimitWith429(t *testing.T) {
	gin.SetMode(gin.TestMode)
	defaultLoginRateLimiter = newLoginRateLimiter(2, time.Minute)

	r := gin.New()
	r.Use(LoginRateLimit())
	r.POST("/login", func(c *gin.Context) { c.JSON(200, gin.H{"ok": true}) })

	for i := 0; i < 2; i++ {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/login", nil)
		req.RemoteAddr = "9.9.9.9:1234"
		r.ServeHTTP(w, req)
		assert.Equal(t, 200, w.Code)
	}

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/login", nil)
	req.RemoteAddr = "9.9.9.9:1234"
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusTooManyRequests, w.Code)
}

func TestResetLoginRateLimit_AllowsImmediateRetryAfterSuccess(t *testing.T) {
	defaultLoginRateLimiter = newLoginRateLimiter(1, time.Minute)

	assert.True(t, defaultLoginRateLimiter.allow("9.9.9.9"))
	assert.False(t, defaultLoginRateLimiter.allow("9.9.9.9"))

	ResetLoginRateLimit("9.9.9.9")

	assert.True(t, defaultLoginRateLimiter.allow("9.9.9.9"))
}
