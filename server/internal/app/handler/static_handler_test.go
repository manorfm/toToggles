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
	req, _ := http.NewRequest("GET", "/api/applications", nil)
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
	// /auth/login vive sob /api/auth/login agora — não precisa mais de bypass
	// dedicado no ServeStatic, só do boundary genérico de isAPIRoute("/api/").
	router.POST("/api/auth/login", func(c *gin.Context) {
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

	// Testa que /api/auth/login não é interceptado pelo ServeStatic
	w = httptest.NewRecorder()
	req, _ = http.NewRequest("POST", "/api/auth/login", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200 for /api/auth/login, got %d", w.Code)
	}

	if w.Body.String() != "auth endpoint" {
		t.Error("Expected auth endpoint content, got index.html instead")
	}
}

// isAPIRoute virou um único boundary de prefixo depois que toda a API (sessão e secret
// key) passou a viver sob /api (routes.go) — antes era uma lista de heurísticas por path
// que colidia repetidamente com rotas SPA de nome parecido (achado ao vivo três vezes
// nesta reescrita: /toggle vs /toggles, /approval vs /approvals, e o pior caso, /teams e
// /applications/:id sendo o MESMO path da tela E da API, sem solução possível por string).
func TestIsAPIRoute(t *testing.T) {
	tests := []struct {
		path     string
		expected bool
	}{
		// Qualquer coisa sob /api/ é API.
		{"/api/applications", true},
		{"/api/applications/123", true},
		{"/api/applications/123/toggles/456", true},
		{"/api/applications/123/toggle/456", true}, // PUT recursivo (singular) — docs/rest-flow.md §7
		{"/api/teams", true},
		{"/api/teams/123/approvers", true},
		{"/api/users", true},
		{"/api/profile", true},
		{"/api/approval/requests", true},
		{"/api/approval/settings", true},
		{"/api/auth/login", true},
		{"/api/toggles", true}, // API pública por secret key

		// Tudo que não começa com /api/ é SPA — incluindo paths que, antes desta correção,
		// eram tratados como API por acidente de string (agora não colidem mais, já que a
		// própria rota real desses recursos mudou pra /api/...).
		{"/api", false}, // sem a barra final não conta como API (evita casar "/apix" também, e "/api" sozinho não é uma rota real)
		{"/static/styles.css", false},
		{"/", false},
		{"/LICENSE", false},
		{"/login", false},
		{"/change-password", false},
		{"/health", false}, // registrado antes do ServeStatic ser plugado (router.Use), nunca passa por aqui de verdade
		{"/dashboard", false},
		{"/some-spa-route", false},
		{"/teams", false},
		{"/teams/123", false},
		{"/applications", false},
		{"/applications/123", false},
		{"/users", false},
		{"/approval", false},
		{"/approval/settings", false},
		{"/approvals", false},
		{"/approvals/settings", false},
		{"/user-management", false},
	}

	for _, test := range tests {
		result := isAPIRoute(test.path)
		if result != test.expected {
			t.Errorf("isAPIRoute(%s) = %v, expected %v", test.path, result, test.expected)
		}
	}
}
