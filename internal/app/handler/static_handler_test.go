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

func TestIsAPIRoute(t *testing.T) {
	tests := []struct {
		path     string
		expected bool
	}{
		{"/applications", true},
		{"/applications/123", true},
		{"/applications/123/toggles", true},
		{"/static/styles.css", false},
		{"/", false},
		{"/LICENSE", false},
		{"/api/test", true},
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
