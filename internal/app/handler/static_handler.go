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
	// Se a rota não for para uma API, serve o index.html
	if !isAPIRoute(c.Request.URL.Path) {
		c.File("static/index.html")
		return
	}
	// Para rotas de API, continua com o handler normal
	c.Next()
}

// isAPIRoute verifica se a rota é uma rota de API
func isAPIRoute(path string) bool {
	return strings.HasPrefix(path, "/applications") ||
		strings.HasPrefix(path, "/api") ||
		strings.HasPrefix(path, "/health")
}

// ServeStaticFiles serve arquivos estáticos específicos
func ServeStaticFiles(c *gin.Context) {
	filePath := c.Param("filepath")
	c.File("static/" + filePath)
}
