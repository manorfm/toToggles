package middleware

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// loginRateLimiter limita tentativas de login por IP — janela deslizante simples, em memória
// (processo único, sem dependência nova, no mesmo espírito minimalista do resto do projeto).
// Não é uma defesa distribuída/multi-instância; é o primeiro degrau razoável contra força bruta
// agora que o login realmente verifica a senha de verdade (antes da correção do bypass de
// autenticação, "login" nem era um alvo de força bruta que importasse). Alias do tipo genérico
// compartilhado (rate_limiter.go) — KillSwitchRateLimit usa o mesmo mecanismo, chaveado por
// secret key em vez de IP.
type loginRateLimiter = slidingWindowLimiter

func newLoginRateLimiter(limit int, window time.Duration) *loginRateLimiter {
	return newSlidingWindowLimiter(limit, window)
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

// Instância própria (não a mesma de LoginRateLimit) — POST /auth/forgot-password sempre responde
// 200 independente do username existir (evita username enumeration), então nunca chama
// ResetLoginRateLimit; compartilhar o limitador de login faria tentativas de reset de senha
// consumirem o mesmo orçamento de tentativas de login de um IP (e vice-versa), dois
// comportamentos sem relação nenhuma entre si.
var defaultForgotPasswordRateLimiter = newLoginRateLimiter(10, 15*time.Minute)

// ForgotPasswordRateLimit limita POST /api/auth/forgot-password a 10 tentativas por IP a cada 15
// minutos — mesmo limite do login, mas contabilizado à parte.
func ForgotPasswordRateLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !defaultForgotPasswordRateLimiter.allow(c.ClientIP()) {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": "Too many requests. Try again later.",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}
