package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestServeStatic(t *testing.T) {
	// Configura o modo de teste do Gin
	gin.SetMode(gin.TestMode)

	// Cria um router de teste
	router := gin.New()
	router.Use(ServeStatic)

	// Testa rota de API (deve passar pelo middleware)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/applications", nil)
	router.ServeHTTP(w, req)

	// Deve retornar 404 pois não há handler para essa rota
	if w.Code != http.StatusNotFound {
		t.Errorf("Expected status 404 for API route, got %d", w.Code)
	}

	// Testa rota de arquivo estático
	w = httptest.NewRecorder()
	req, _ = http.NewRequest("GET", "/static/test.css", nil)
	router.ServeHTTP(w, req)

	// Deve retornar 404 pois o arquivo não existe
	if w.Code != http.StatusNotFound {
		t.Errorf("Expected status 404 for non-existent static file, got %d", w.Code)
	}
}

func TestServeStaticAuthRoutes(t *testing.T) {
	// Configura o modo de teste do Gin
	gin.SetMode(gin.TestMode)

	// Cria um router de teste
	router := gin.New()
	router.Use(ServeStatic)
	
	// Adiciona handler para rotas de auth para simular comportamento real
	router.GET("/login", func(c *gin.Context) {
		c.String(http.StatusOK, "login page")
	})
	router.POST("/auth/login", func(c *gin.Context) {
		c.String(http.StatusOK, "auth endpoint")
	})

	// Testa que /login não é interceptado pelo ServeStatic
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/login", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200 for /login, got %d", w.Code)
	}
	
	if w.Body.String() != "login page" {
		t.Error("Expected login page content, got index.html instead")
	}

	// Testa que /auth/login não é interceptado pelo ServeStatic
	w = httptest.NewRecorder()
	req, _ = http.NewRequest("POST", "/auth/login", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200 for /auth/login, got %d", w.Code)
	}
	
	if w.Body.String() != "auth endpoint" {
		t.Error("Expected auth endpoint content, got index.html instead")
	}
}

func TestIsAPIRoute(t *testing.T) {
	tests := []struct {
		path     string
		expected bool
	}{
		// API routes que devem retornar true
		{"/applications", true},
		{"/applications/123", true},
		{"/applications/123/toggles", true},
		{"/applications/123/toggles/456", true},
		{"/applications/123/toggle/456", true}, // PUT recursivo (singular) — docs/rest-flow.md §7
		{"/api/test", true},
		{"/health", true},
		{"/approval", true},
		{"/approval/requests", true},
		{"/approval/settings", true},
		{"/approval/enabled", true},

		// Rotas não-API que devem retornar false
		{"/static/styles.css", false},
		{"/", false},
		{"/LICENSE", false},
		{"/login", false},
		{"/auth/login", false},
		{"/auth/logout", false},
		{"/dashboard", false},
		{"/some-spa-route", false},
		// /approvals (rota SPA — screens/ApprovalsScreen.tsx) não pode colidir com o prefixo real
		// de API "/approval" (sem "s"): "/approvals" também começa com "/approval" por acidente de
		// string, então um hard refresh nessa tela devolvia 404 puro em vez da casca do SPA
		// (confirmado ao vivo: curl -i http://localhost:3056/approvals).
		{"/approvals", false},
		{"/approvals/settings", false},
	}

	for _, test := range tests {
		result := isAPIRoute(test.path)
		if result != test.expected {
			t.Errorf("isAPIRoute(%s) = %v, expected %v", test.path, result, test.expected)
		}
	}
}
