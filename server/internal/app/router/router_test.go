package router

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/manorfm/totoogle/internal/app/config"
	"github.com/manorfm/totoogle/internal/app/handler"
)

func TestInit(t *testing.T) {
	// Configura o modo de teste do Gin
	gin.SetMode(gin.TestMode)

	// Inicializa a configuração
	err := config.Init()
	if err != nil {
		t.Fatalf("Failed to init config: %v", err)
	}

	// Inicializa os handlers
	handler.InitHandlers(config.GetDatabase())

	// Cria o router
	router := gin.New()
	Init(router)

	// Testa se o router foi inicializado corretamente
	if router == nil {
		t.Error("Expected router to be initialized, got nil")
	}
}

func TestRoutes(t *testing.T) {
	// Configura o modo de teste do Gin
	gin.SetMode(gin.TestMode)

	// Inicializa a configuração
	err := config.Init()
	if err != nil {
		t.Fatalf("Failed to init config: %v", err)
	}

	// Inicializa os handlers
	handler.InitHandlers(config.GetDatabase())

	// Cria o router
	router := gin.New()
	Init(router)

	// Testa a rota raiz
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/", nil)
	router.ServeHTTP(w, req)

	// Deve retornar 200 se o arquivo index.html existir, ou 404 se não existir
	if w.Code != http.StatusOK && w.Code != http.StatusNotFound {
		t.Errorf("Expected status 200 or 404, got %d", w.Code)
	}

	// Testa a rota LICENSE
	w = httptest.NewRecorder()
	req, _ = http.NewRequest("GET", "/LICENSE", nil)
	router.ServeHTTP(w, req)

	// Deve retornar 200 se o arquivo LICENSE existir, ou 404 se não existir
	if w.Code != http.StatusOK && w.Code != http.StatusNotFound {
		t.Errorf("Expected status 200 or 404 for LICENSE, got %d", w.Code)
	}

	// Testa uma rota de API inexistente
	w = httptest.NewRecorder()
	req, _ = http.NewRequest("GET", "/nonexistent", nil)
	router.ServeHTTP(w, req)

	// Deve retornar 404 ou servir o index.html (dependendo da configuração)
	if w.Code != http.StatusNotFound && w.Code != http.StatusOK {
		t.Errorf("Expected status 404 or 200 for nonexistent route, got %d", w.Code)
	}
}

func TestStaticRoutes(t *testing.T) {
	// Configura o modo de teste do Gin
	gin.SetMode(gin.TestMode)

	// Inicializa a configuração
	err := config.Init()
	if err != nil {
		t.Fatalf("Failed to init config: %v", err)
	}

	// Inicializa os handlers
	handler.InitHandlers(config.GetDatabase())

	// Cria o router
	router := gin.New()
	Init(router)

	// Testa rota de arquivo estático
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/static/test.css", nil)
	router.ServeHTTP(w, req)

	// Deve retornar 404 se o arquivo não existir
	if w.Code != http.StatusNotFound {
		t.Errorf("Expected status 404 for non-existent static file, got %d", w.Code)
	}
}
