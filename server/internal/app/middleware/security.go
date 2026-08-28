package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/oklog/ulid/v2"
)

// SecurityHeaders adiciona headers de segurança à resposta
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Content Security Policy - previne XSS
		c.Header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com; connect-src 'self';")

		// X-Frame-Options - previne clickjacking
		c.Header("X-Frame-Options", "DENY")

		// X-Content-Type-Options - previne MIME sniffing
		c.Header("X-Content-Type-Options", "nosniff")

		// X-XSS-Protection - proteção adicional contra XSS
		c.Header("X-XSS-Protection", "1; mode=block")

		// Referrer Policy - controla informações de referência
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")

		// Permissions Policy - controla recursos do navegador
		c.Header("Permissions-Policy", "geolocation=(), microphone=(), camera=()")

		// Cache Control para toda a API (sob /api — ver routes.go/static_handler.go):
		// antes checava só 3 paths exatos ("/applications", "/applications/",
		// "/applications/:id/toggles"), deixando /teams, /users, /approval etc. sem essa
		// proteção contra cache de dados autenticados. Agora cobre a API inteira.
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.Header("Cache-Control", "no-cache, no-store, must-revalidate")
			c.Header("Pragma", "no-cache")
			c.Header("Expires", "0")
		}

		c.Next()
	}
}

// RequestID adiciona um ID único para cada requisição
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestID := c.GetHeader("X-Request-ID")
		if requestID == "" {
			requestID = generateRequestID()
		}
		c.Header("X-Request-ID", requestID)
		c.Set("request_id", requestID)
		c.Next()
	}
}

// generateRequestID gera um ID único para a requisição
func generateRequestID() string {
	// Implementação simples - em produção usar UUID
	return "req-" + generateULID()
}

// generateULID gera um ULID simples
func generateULID() string {
	return ulid.Make().String()
}
