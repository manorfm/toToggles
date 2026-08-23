package handler

import (
	"strings"

	"github.com/gin-gonic/gin"
)

// ServeStatic serve os arquivos estáticos do frontend
func ServeStatic(c *gin.Context) {
	// NÃO intercepta rotas de arquivos estáticos
	if strings.HasPrefix(c.Request.URL.Path, "/static/") {
		c.Next()
		return
	}
	// NÃO intercepta a rota LICENSE
	if c.Request.URL.Path == "/LICENSE" {
		c.Next()
		return
	}
	// NÃO intercepta páginas especiais do SPA que precisam do handler dedicado delas
	// rodar (ex.: /change-password valida um token específico antes de servir a casca).
	if c.Request.URL.Path == "/login" || c.Request.URL.Path == "/change-password" {
		c.Next()
		return
	}
	// Se a rota não for para uma API, serve a casca do frontend (React, server/web)
	if !isAPIRoute(c.Request.URL.Path) {
		c.File("static/app/index.html")
		return
	}
	// Para rotas de API, continua com o handler normal
	c.Next()
}

// isAPIRoute verifica se a rota é uma rota de API. Toda a API (sessão ou secret key)
// vive sob /api (routes.go) — isso substitui uma lista antiga de heurísticas por path
// que colidia repetidamente com rotas SPA de nome parecido (ex.: GET /teams sendo tanto
// a tela quanto a rota de API, /applications/:id idem — nenhuma heurística de string
// resolve isso quando os dois paths são literalmente o mesmo; só um namespace dedicado
// resolve de vez).
func isAPIRoute(path string) bool {
	return strings.HasPrefix(path, "/api/")
}
