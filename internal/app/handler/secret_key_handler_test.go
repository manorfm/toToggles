package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupSecretKeyTestRouter() (*gin.Engine, *gorm.DB) {
	gin.SetMode(gin.TestMode)
	
	// Cria base de dados em memória para testes
	db, _ := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	
	// Auto migrate tables
	db.AutoMigrate(&entity.Application{}, &entity.Toggle{}, &entity.User{}, &entity.SecretKey{})
	
	// Inicializa handlers com a base de dados de teste
	InitHandlers(db)
	
	// Cria router de teste
	router := gin.New()
	
	// Mock user middleware
	router.Use(func(c *gin.Context) {
		c.Set("user", &entity.User{
			ID:       "test-user-id",
			Username: "testuser",
		})
		c.Next()
	})
	
	// Rotas de secret keys
	applications := router.Group("/applications")
	{
		applications.POST("/:id/generate-secret", GenerateSecretKey)
		applications.GET("/:id/secret-keys", GetSecretKeys)
	}
	
	router.GET("/api/toggles/by-secret/:secret", GetTogglesBySecret)
	router.DELETE("/secret-keys/:id", DeleteSecretKey)
	
	return router, db
}

func TestGenerateSecretKey(t *testing.T) {
	router, db := setupSecretKeyTestRouter()
	
	app := &entity.Application{
		ID:   "test-app-id",
		Name: "Test App",
	}
	db.Create(app)
	
	// Test successful secret key generation
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/applications/test-app-id/generate-secret", nil)
	router.ServeHTTP(w, req)
	
	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}
	
	var response map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &response)
	
	if !response["success"].(bool) {
		t.Error("Expected success to be true")
	}
	
	if response["plain_key"] == nil {
		t.Error("Expected plain_key to be present")
	}
	
	plainKey := response["plain_key"].(string)
	if !strings.HasPrefix(plainKey, "sk_") {
		t.Error("Expected secret key to start with 'sk_'")
	}
}

func TestGetSecretKeys(t *testing.T) {
	router, _ := setupSecretKeyTestRouter()
	
	// Test getting secret keys for an application
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/applications/test-app-id/secret-keys", nil)
	router.ServeHTTP(w, req)
	
	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}
	
	var response map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &response)
	
	if !response["success"].(bool) {
		t.Error("Expected success to be true")
	}
	
	if response["secret_keys"] == nil {
		t.Error("Expected secret_keys to be present")
	}
}

func TestGetTogglesBySecret_InvalidSecret(t *testing.T) {
	router, _ := setupSecretKeyTestRouter()
	
	// Test with invalid secret key
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/toggles/by-secret/invalid-secret", nil)
	router.ServeHTTP(w, req)
	
	if w.Code != http.StatusNotFound {
		t.Errorf("Expected status 404, got %d", w.Code)
	}
	
	var response map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &response)
	
	if response["error"] == nil {
		t.Error("Expected error message")
	}
}

func TestGetTogglesBySecret_ValidSecret(t *testing.T) {
	router, db := setupSecretKeyTestRouter()
	
	app := &entity.Application{
		ID:   "test-app-id",
		Name: "Test App",
	}
	db.Create(app)
	
	// Create a secret key
	secretKey := &entity.SecretKey{
		ID:            "test-secret-id",
		Name:          "Test Secret",
		ApplicationID: "test-app-id",
		CreatedBy:     "test-user-id",
	}
	plainKey, _ := secretKey.SetSecretKey()
	db.Create(secretKey)
	
	// Create some toggles
	toggle1 := &entity.Toggle{
		ID:      "toggle-1",
		Path:    "feature.toggle1",
		Enabled: true,
		AppID:   "test-app-id",
		Value:   "toggle1",
		Level:   1,
	}
	toggle2 := &entity.Toggle{
		ID:      "toggle-2", 
		Path:    "feature.toggle2",
		Enabled: false,
		AppID:   "test-app-id",
		Value:   "toggle2",
		Level:   1,
	}
	db.Create(toggle1)
	db.Create(toggle2)
	
	// Test with valid secret key
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/toggles/by-secret/"+plainKey, nil)
	router.ServeHTTP(w, req)
	
	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}
	
	var response map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &response)
	
	if !response["success"].(bool) {
		t.Error("Expected success to be true")
	}
	
	if response["toggles"] == nil {
		t.Error("Expected toggles to be present")
	}
	
	if response["application_id"] != "test-app-id" {
		t.Error("Expected correct application_id")
	}
}

func TestSecretKeyRegeneration(t *testing.T) {
	// Create separate router for this test to avoid database conflicts
	gin.SetMode(gin.TestMode)
	
	// Cria base de dados em memória para testes
	db, _ := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	
	// Auto migrate tables
	db.AutoMigrate(&entity.Application{}, &entity.Toggle{}, &entity.User{}, &entity.SecretKey{})
	
	// Inicializa handlers com a base de dados de teste
	InitHandlers(db)
	
	// Cria router de teste
	router := gin.New()
	
	// Mock user middleware
	router.Use(func(c *gin.Context) {
		c.Set("user", &entity.User{
			ID:       "test-user-id",
			Username: "testuser",
		})
		c.Next()
	})
	
	// Rotas de secret keys
	applications := router.Group("/applications")
	{
		applications.POST("/:id/generate-secret", GenerateSecretKey)
	}
	
	router.GET("/api/toggles/by-secret/:secret", GetTogglesBySecret)
	
	// Setup: Create application and initial secret key
	app := &entity.Application{
		ID:   "test-app-id",
		Name: "Test App",
	}
	db.Create(app)
	
	// Generate first secret key
	w1 := httptest.NewRecorder()
	req1, _ := http.NewRequest("POST", "/applications/test-app-id/generate-secret", nil)
	router.ServeHTTP(w1, req1)
	
	var response1 map[string]interface{}
	json.Unmarshal(w1.Body.Bytes(), &response1)
	firstKey := response1["plain_key"].(string)
	
	// Generate second secret key (should invalidate first)
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest("POST", "/applications/test-app-id/generate-secret", nil)
	router.ServeHTTP(w2, req2)
	
	var response2 map[string]interface{}
	json.Unmarshal(w2.Body.Bytes(), &response2)
	secondKey := response2["plain_key"].(string)
	
	// Keys should be different
	if firstKey == secondKey {
		t.Error("Regenerated key should be different from previous key")
	}
	
	// First key should no longer work
	w3 := httptest.NewRecorder()
	req3, _ := http.NewRequest("GET", "/api/toggles/by-secret/"+firstKey, nil)
	router.ServeHTTP(w3, req3)
	
	if w3.Code != http.StatusNotFound {
		t.Errorf("Expected status 404 for old key, got %d", w3.Code)
	}
	
	// Second key should work
	w4 := httptest.NewRecorder()
	req4, _ := http.NewRequest("GET", "/api/toggles/by-secret/"+secondKey, nil)
	router.ServeHTTP(w4, req4)
	
	if w4.Code != http.StatusOK {
		t.Errorf("Expected status 200 for new key, got %d", w4.Code)
	}
}