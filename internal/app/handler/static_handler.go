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
	// NÃO intercepta rotas de autenticação
	if strings.HasPrefix(c.Request.URL.Path, "/auth/") || c.Request.URL.Path == "/login" {
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
	// Rotas básicas de API
	if strings.HasPrefix(path, "/api") || strings.HasPrefix(path, "/health") {
		return true
	}
	
	// Rotas específicas de secret keys
	if strings.HasPrefix(path, "/secret-keys") {
		return true
	}
	
	// Rotas de gerenciamento de usuários
	if strings.HasPrefix(path, "/users") {
		return true
	}
	
	// Rotas de perfil do usuário
	if strings.HasPrefix(path, "/profile") {
		return true
	}
	
	// Rotas de gerenciamento de times
	if strings.HasPrefix(path, "/teams") {
		return true
	}
	
	// Rota base de applications
	if path == "/applications" {
		return true
	}
	
	// Verifica rotas de /applications/
	if strings.HasPrefix(path, "/applications/") {
		// Secret key routes - sempre API
		if strings.Contains(path, "/generate-secret") || strings.Contains(path, "/secret-keys") {
			return true
		}
		
		// Remove o prefixo /applications/
		remaining := strings.TrimPrefix(path, "/applications/")
		parts := strings.Split(remaining, "/")
		
		if len(parts) >= 1 && parts[0] != "" {
			// Lista de palavras reservadas que indicam SPA routes, não API
			spaKeywords := []string{"view", "edit", "dashboard", "settings", "create", "list"}
			
			// Se a primeira parte é uma palavra reservada, é SPA route
			for _, keyword := range spaKeywords {
				if parts[0] == keyword {
					return false
				}
			}
			
			// Se tem apenas o ID: /applications/{id} (assumindo que IDs não são palavras reservadas)
			if len(parts) == 1 {
				return true
			}
			// Se tem ID e "toggles": /applications/{id}/toggles
			if len(parts) >= 2 && parts[1] == "toggles" {
				return true
			}
		}
		// Caso contrário, assumir que é SPA route
		return false
	}
	
	return false
}

// ServeStaticFiles serve arquivos estáticos específicos
func ServeStaticFiles(c *gin.Context) {
	filePath := c.Param("filepath")
	c.File("static/" + filePath)
}
