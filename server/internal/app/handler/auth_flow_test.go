package handler

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// setupAuthTestRouter cria um router de teste com todas as rotas configuradas
func setupAuthTestRouter(t *testing.T) *gin.Engine {
	// Configura o modo de teste do Gin
	gin.SetMode(gin.TestMode)
	
	// Cria base de dados em memória para testes
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("Failed to create test database: %v", err)
	}
	
	// Inicializa handlers com a base de dados de teste
	InitHandlers(db)
	
	// Cria router de teste com as rotas necessárias para os testes
	router := gin.New()
	
	// Middleware
	router.Use(ServeStatic)
	
	// Rotas públicas de autenticação
	auth := router.Group("/auth")
	{
		auth.POST("/login", Login)
		auth.POST("/logout", Logout)
	}

	// Rotas protegidas que requerem autenticação
	protected := router.Group("")
	protected.Use(ValidateToken())
	{
		// Rotas de aplicações
		applications := protected.Group("/applications")
		{
			applications.POST("", CreateApplication)
			applications.GET("", GetAllApplications)
			applications.GET("/:id", GetApplication)
			applications.PUT("/:id", UpdateApplication)
			applications.DELETE("/:id", DeleteApplication)
		}

		// Rotas de toggles
		toggles := protected.Group("/applications/:id/toggles")
		{
			toggles.POST("", CreateToggle)
			toggles.GET("", GetAllToggles)
		}
	}

	// Rota para página de login
	router.GET("/login", func(c *gin.Context) {
		c.File("static/login.html")
	})

	// Rota raiz serve o frontend (protegida)
	router.GET("/", ValidateToken(), func(c *gin.Context) {
		c.File("static/index.html")
	})
	
	return router
}

// createTestHTMLFiles cria arquivos HTML temporários para os testes
func createTestHTMLFiles(t *testing.T) (string, func()) {
	// Cria diretório temporário
	tempDir, err := os.MkdirTemp("", "totoogle_test_")
	if err != nil {
		t.Fatalf("Failed to create temp directory: %v", err)
	}
	
	// Cria diretório static
	staticDir := filepath.Join(tempDir, "static")
	err = os.MkdirAll(staticDir, 0755)
	if err != nil {
		t.Fatalf("Failed to create static directory: %v", err)
	}
	
	// Cria arquivo index.html
	indexContent := `<!DOCTYPE html>
<html>
<head><title>ToToogle</title></head>
<body>
	<div id="applications-section">Main App</div>
	<script src="/static/script.js"></script>
</body>
</html>`
	
	err = os.WriteFile(filepath.Join(staticDir, "index.html"), []byte(indexContent), 0644)
	if err != nil {
		t.Fatalf("Failed to create index.html: %v", err)
	}
	
	// Cria arquivo login.html
	loginContent := `<!DOCTYPE html>
<html>
<head><title>Login - ToToogle</title></head>
<body class="login-body">
	<div class="login-container">
		<form id="login-form">
			<input type="text" id="username" placeholder="Username">
			<input type="password" id="password" placeholder="Password">
			<button type="submit">Login</button>
		</form>
	</div>
	<script src="/static/login.js"></script>
</body>
</html>`
	
	err = os.WriteFile(filepath.Join(staticDir, "login.html"), []byte(loginContent), 0644)
	if err != nil {
		t.Fatalf("Failed to create login.html: %v", err)
	}
	
	// Muda para o diretório temporário
	originalDir, _ := os.Getwd()
	err = os.Chdir(tempDir)
	if err != nil {
		t.Fatalf("Failed to change directory: %v", err)
	}
	
	// Retorna função de cleanup
	cleanup := func() {
		os.Chdir(originalDir)
		os.RemoveAll(tempDir)
	}
	
	return tempDir, cleanup
}

func TestLoginPageServing(t *testing.T) {
	// Configura arquivos de teste
	_, cleanup := createTestHTMLFiles(t)
	defer cleanup()
	
	// Configura router
	router := setupAuthTestRouter(t)
	
	// Testa acesso à página de login
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/login", nil)
	router.ServeHTTP(w, req)
	
	// Deve retornar 200 OK
	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200 for /login, got %d", w.Code)
	}
	
	// Deve conter o conteúdo do login.html
	body := w.Body.String()
	if !strings.Contains(body, "login-body") {
		t.Error("Response should contain login.html content")
	}
	
	if !strings.Contains(body, "login-form") {
		t.Error("Response should contain login form")
	}
	
	// Não deve conter conteúdo da aplicação principal
	if strings.Contains(body, "applications-section") {
		t.Error("Login page should not contain main app content")
	}
}

func TestMainPageRequiresAuthentication(t *testing.T) {
	// Configura arquivos de teste
	_, cleanup := createTestHTMLFiles(t)
	defer cleanup()
	
	// Cria router de teste SEM o middleware ServeStatic para testar só a autenticação
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("Failed to create test database: %v", err)
	}
	InitHandlers(db)
	
	router := gin.New()
	
	// Apenas a rota protegida, sem ServeStatic
	router.GET("/", ValidateToken(), func(c *gin.Context) {
		c.File("static/index.html")
	})
	
	// Testa acesso à página principal sem autenticação
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/", nil)
	router.ServeHTTP(w, req)
	
	// Deve retornar 307 Temporary Redirect para /login (comportamento correto do middleware)
	if w.Code != http.StatusTemporaryRedirect {
		t.Errorf("Expected status 307 (redirect to login) for unauthenticated access to /, got %d", w.Code)
	}
	
	// Verificar se está redirecionando para /login
	location := w.Header().Get("Location")
	if location != "/login" {
		t.Errorf("Expected redirect to /login, got %s", location)
	}
}

func TestAPIRoutesRequireAuthentication(t *testing.T) {
	// Configura router
	router := setupAuthTestRouter(t)
	
	// Lista de rotas protegidas para testar
	protectedRoutes := []struct {
		method string
		path   string
	}{
		{"GET", "/applications"},
		{"POST", "/applications"},
		{"GET", "/applications/123"},
		{"PUT", "/applications/123"},
		{"DELETE", "/applications/123"},
		{"GET", "/applications/123/toggles"},
		{"POST", "/applications/123/toggles"},
	}
	
	for _, route := range protectedRoutes {
		t.Run(route.method+"_"+route.path, func(t *testing.T) {
			w := httptest.NewRecorder()
			req, _ := http.NewRequest(route.method, route.path, nil)
			router.ServeHTTP(w, req)
			
			// Deve retornar 401 Unauthorized
			if w.Code != http.StatusUnauthorized {
				t.Errorf("Expected status 401 for %s %s without auth, got %d", 
					route.method, route.path, w.Code)
			}
		})
	}
}

func TestStaticMiddlewareBypassesLoginRoutes(t *testing.T) {
	// Configura arquivos de teste
	_, cleanup := createTestHTMLFiles(t)
	defer cleanup()
	
	// Cria router apenas com o middleware ServeStatic
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(ServeStatic)
	
	// Adiciona rota específica para /login (como no router real)
	router.GET("/login", func(c *gin.Context) {
		c.File("static/login.html")
	})
	
	// Testa que /login não é interceptado pelo ServeStatic
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/login", nil)
	router.ServeHTTP(w, req)
	
	// Deve retornar 200 e conter conteúdo do login
	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200 for /login, got %d", w.Code)
	}
	
	body := w.Body.String()
	if !strings.Contains(body, "login-body") {
		t.Error("Response should contain login.html content, not index.html")
	}
}

func TestStaticMiddlewareServesMainPageForNonAPIRoutes(t *testing.T) {
	// Configura arquivos de teste
	_, cleanup := createTestHTMLFiles(t)
	defer cleanup()
	
	// Cria router apenas com o middleware ServeStatic
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(ServeStatic)
	
	// Testa rotas que devem servir index.html
	testRoutes := []string{
		"/",
		"/some-spa-route",
		"/applications/view/123",
		"/dashboard",
	}
	
	for _, path := range testRoutes {
		t.Run(path, func(t *testing.T) {
			w := httptest.NewRecorder()
			req, _ := http.NewRequest("GET", path, nil)
			router.ServeHTTP(w, req)
			
			// Deve retornar 200 e conter conteúdo do index.html
			if w.Code != http.StatusOK {
				t.Errorf("Expected status 200 for %s, got %d", path, w.Code)
			}
			
			body := w.Body.String()
			if !strings.Contains(body, "applications-section") {
				t.Errorf("Response for %s should contain index.html content", path)
			}
		})
	}
}

func TestStaticMiddlewareBypassesStaticFiles(t *testing.T) {
	// Cria router apenas com o middleware ServeStatic
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(ServeStatic)
	
	// Adiciona rota para arquivos estáticos (como no router real)
	router.Static("/static", "./static")
	
	// Testa que rotas /static/* não são interceptadas
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/static/nonexistent.css", nil)
	router.ServeHTTP(w, req)
	
	// Deve retornar 404 (não encontrado), não 200 com index.html
	if w.Code != http.StatusNotFound {
		t.Errorf("Expected status 404 for non-existent static file, got %d", w.Code)
	}
}

func TestIsAPIRouteUpdated(t *testing.T) {
	tests := []struct {
		path     string
		expected bool
	}{
		// Rotas de API que devem retornar true
		{"/applications", true},
		{"/applications/123", true},
		{"/applications/123/toggles", true},
		{"/api/test", true},
		{"/health", true},
		
		// Rotas que NÃO são de API
		{"/", false},
		{"/login", false},
		{"/auth/login", false},
		{"/auth/logout", false},
		{"/static/styles.css", false},
		{"/LICENSE", false},
		{"/dashboard", false},
		{"/some-spa-route", false},
		{"/applications/view/123", false},
		{"/applications/edit/456", false},
		{"/applications/dashboard", false},
	}
	
	for _, test := range tests {
		t.Run(test.path, func(t *testing.T) {
			result := isAPIRoute(test.path)
			if result != test.expected {
				t.Errorf("isAPIRoute(%s) = %v, expected %v", test.path, result, test.expected)
			}
		})
	}
}

// TestAuthenticationFlow testa o fluxo completo de autenticação
func TestAuthenticationFlow(t *testing.T) {
	// Configura arquivos de teste
	_, cleanup := createTestHTMLFiles(t)
	defer cleanup()
	
	// Configura router
	router := setupAuthTestRouter(t)
	
	t.Run("Unauthenticated user gets 401 on protected routes", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/applications", nil)
		router.ServeHTTP(w, req)
		
		if w.Code != http.StatusUnauthorized {
			t.Errorf("Expected 401 for unauthenticated request, got %d", w.Code)
		}
	})
	
	t.Run("Login page is accessible without authentication", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/login", nil)
		router.ServeHTTP(w, req)
		
		if w.Code != http.StatusOK {
			t.Errorf("Expected 200 for login page, got %d", w.Code)
		}
		
		body := w.Body.String()
		if !strings.Contains(body, "login-form") {
			t.Error("Login page should contain login form")
		}
	})
	
	t.Run("Auth endpoints are accessible", func(t *testing.T) {
		// Testa POST /auth/login (deve retornar 400 sem dados válidos)
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/auth/login", nil)
		router.ServeHTTP(w, req)
		
		// Deve aceitar a requisição mas retornar erro de validação
		if w.Code != http.StatusBadRequest && w.Code != http.StatusUnauthorized {
			t.Errorf("Expected 400 or 401 for empty login request, got %d", w.Code)
		}
	})
}