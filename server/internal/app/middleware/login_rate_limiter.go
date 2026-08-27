package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// loginRateLimiter limita tentativas de login por IP — janela deslizante simples, em memória
// (processo único, sem dependência nova, no mesmo espírito minimalista do resto do projeto).
// Não é uma defesa distribuída/multi-instância; é o primeiro degrau razoável contra força bruta
// agora que o login realmente verifica a senha de verdade (antes da correção do bypass de
// autenticação, "login" nem era um alvo de força bruta que importasse).
type loginRateLimiter struct {
	mu       sync.Mutex
	attempts map[string]*loginAttempt
	limit    int
	window   time.Duration
}

type loginAttempt struct {
	count      int
	windowFrom time.Time
}

func newLoginRateLimiter(limit int, window time.Duration) *loginRateLimiter {
	return &loginRateLimiter{
		attempts: make(map[string]*loginAttempt),
		limit:    limit,
		window:   window,
	}
}

func (l *loginRateLimiter) allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	a, exists := l.attempts[key]
	if !exists || now.Sub(a.windowFrom) > l.window {
		l.attempts[key] = &loginAttempt{count: 1, windowFrom: now}
		return true
	}

	if a.count >= l.limit {
		return false
	}
	a.count++
	return true
}

func (l *loginRateLimiter) reset(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.attempts, key)
}

var defaultLoginRateLimiter = newLoginRateLimiter(10, 15*time.Minute)

// LoginRateLimit limita POST /api/auth/login a 10 tentativas por IP a cada 15 minutos —
// estourar devolve 429. Resetado por ResetLoginRateLimit após um login bem-sucedido, pra não
// penalizar o próximo login legítimo por tentativas erradas anteriores (ex.: mesmo IP via NAT
// compartilhado).
func LoginRateLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !defaultLoginRateLimiter.allow(c.ClientIP()) {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": "Too many login attempts. Try again later.",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}

// ResetLoginRateLimit limpa o contador de tentativas de um IP.
func ResetLoginRateLimit(clientIP string) {
	defaultLoginRateLimiter.reset(clientIP)
}
