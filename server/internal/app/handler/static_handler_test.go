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
		{"/api/test", true},
		{"/health", true},
		
		// Rotas não-API que devem retornar false
		{"/static/styles.css", false},
		{"/", false},
		{"/LICENSE", false},
		{"/login", false},
		{"/auth/login", false},
		{"/auth/logout", false},
		{"/dashboard", false},
		{"/some-spa-route", false},
	}

	for _, test := range tests {
		result := isAPIRoute(test.path)
		if result != test.expected {
			t.Errorf("isAPIRoute(%s) = %v, expected %v", test.path, result, test.expected)
		}
	}
}

func TestServeStaticFiles(t *testing.T) {
	// Configura o modo de teste do Gin
	gin.SetMode(gin.TestMode)

	// Cria um router de teste
	router := gin.New()
	router.GET("/*filepath", ServeStaticFiles)

	// Testa rota de arquivo inexistente
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/nonexistent.html", nil)
	router.ServeHTTP(w, req)

	// Deve retornar 404
	if w.Code != http.StatusNotFound {
		t.Errorf("Expected status 404 for non-existent file, got %d", w.Code)
	}

	// Testa rota raiz (deve servir index.html)
	w = httptest.NewRecorder()
	req, _ = http.NewRequest("GET", "/", nil)
	router.ServeHTTP(w, req)

	// Deve retornar 200 se o arquivo index.html existir
	if w.Code != http.StatusOK && w.Code != http.StatusNotFound {
		t.Errorf("Expected status 200 or 404 for root path, got %d", w.Code)
	}
}
