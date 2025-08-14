package middleware

import (
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

		// Cache Control para APIs
		if c.Request.URL.Path == "/applications" ||
			c.Request.URL.Path == "/applications/" ||
			c.Request.URL.Path == "/applications/:id/toggles" {
			c.Header("Cache-Control", "no-cache, no-store, must-revalidate")
			c.Header("Pragma", "no-cache")
			c.Header("Expires", "0")
		}

		c.Next()
	}
}

// CORSHeaders adiciona headers CORS básicos
func CORSHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		// For same-origin requests (our case), we can be more permissive
		// In production, restrict this to specific domains
		origin := c.GetHeader("Origin")
		if origin != "" {
			c.Header("Access-Control-Allow-Origin", origin)
		}
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
		c.Header("Access-Control-Expose-Headers", "Content-Length")
		c.Header("Access-Control-Allow-Credentials", "true")

		// Responder a preflight requests
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
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
