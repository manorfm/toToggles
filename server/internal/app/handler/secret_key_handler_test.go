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
	db.AutoMigrate(&entity.Application{}, &entity.Toggle{}, &entity.User{}, &entity.SecretKey{}, &entity.Session{})

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

	router.GET("/api/toggles", GetTogglesBySecret)
	router.POST("/api/toggles/disable", DisableToggleBySecret)
	router.DELETE("/secret-keys/:id", DeleteSecretKey)

	return router, db
}

func disableToggleRequest(path, apiKey string) *http.Request {
	body := strings.NewReader(`{"path": "` + path + `"}`)
	req, _ := http.NewRequest("POST", "/api/toggles/disable", body)
	req.Header.Set("Content-Type", "application/json")
	if apiKey != "" {
		req.Header.Set("X-API-Key", apiKey)
	}
	return req
}

func TestDisableToggleBySecret_MissingHeader(t *testing.T) {
	router, _ := setupSecretKeyTestRouter()

	w := httptest.NewRecorder()
	router.ServeHTTP(w, disableToggleRequest("feature.toggle1", ""))

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected status 401, got %d", w.Code)
	}
}

func TestDisableToggleBySecret_InvalidSecret(t *testing.T) {
	router, _ := setupSecretKeyTestRouter()

	w := httptest.NewRecorder()
	router.ServeHTTP(w, disableToggleRequest("feature.toggle1", "invalid-secret"))

	if w.Code != http.StatusNotFound {
		t.Errorf("Expected status 404, got %d", w.Code)
	}
}

func TestDisableToggleBySecret_UnknownPath(t *testing.T) {
	router, db := setupSecretKeyTestRouter()

	app := &entity.Application{ID: "app-a", Name: "App A"}
	db.Create(app)
	secretKey := &entity.SecretKey{ID: "key-a", Name: "Key A", ApplicationID: "app-a", CreatedBy: "test-user-id", Active: true}
	plainKey, _ := secretKey.SetSecretKey()
	db.Create(secretKey)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, disableToggleRequest("does.not.exist", plainKey))

	if w.Code != http.StatusNotFound {
		t.Errorf("Expected status 404, got %d", w.Code)
	}
}

// Security-critical: a secret key must never be able to disable a toggle belonging to a
// DIFFERENT application, even knowing its exact path. Enforced by ToggleUseCase.UpdateToggle
// scoping GetByPath to the key's own ApplicationID — this test proves that scoping actually
// holds at the HTTP boundary, not just in the usecase's own unit tests.
func TestDisableToggleBySecret_CrossApplicationPath_NotFound(t *testing.T) {
	router, db := setupSecretKeyTestRouter()

	appA := &entity.Application{ID: "app-a", Name: "App A"}
	appB := &entity.Application{ID: "app-b", Name: "App B"}
	db.Create(appA)
	db.Create(appB)

	keyA := &entity.SecretKey{ID: "key-a", Name: "Key A", ApplicationID: "app-a", CreatedBy: "test-user-id", Active: true}
	plainKeyA, _ := keyA.SetSecretKey()
	db.Create(keyA)

	toggleB := &entity.Toggle{ID: "toggle-b", Path: "feature.shared-name", Enabled: true, AppID: "app-b", Value: "shared-name", Level: 1}
	db.Create(toggleB)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, disableToggleRequest("feature.shared-name", plainKeyA))

	if w.Code != http.StatusNotFound {
		t.Errorf("Expected status 404 (cross-application path must not resolve), got %d", w.Code)
	}

	var reloaded entity.Toggle
	db.First(&reloaded, "id = ?", "toggle-b")
	if !reloaded.Enabled {
		t.Error("toggle in the other application must not have been disabled")
	}
}

func TestDisableToggleBySecret_Success(t *testing.T) {
	router, db := setupSecretKeyTestRouter()

	app := &entity.Application{ID: "app-a", Name: "App A"}
	db.Create(app)
	secretKey := &entity.SecretKey{ID: "key-a", Name: "Key A", ApplicationID: "app-a", CreatedBy: "test-user-id", Active: true}
	plainKey, _ := secretKey.SetSecretKey()
	db.Create(secretKey)
	toggle := &entity.Toggle{ID: "toggle-a", Path: "feature.rollout", Enabled: true, AppID: "app-a", Value: "rollout", Level: 1}
	db.Create(toggle)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, disableToggleRequest("feature.rollout", plainKey))

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var reloaded entity.Toggle
	db.First(&reloaded, "id = ?", "toggle-a")
	if reloaded.Enabled {
		t.Error("expected the toggle to be disabled")
	}
}

func TestDisableToggleBySecret_IdempotentWhenAlreadyDisabled(t *testing.T) {
	router, db := setupSecretKeyTestRouter()

	app := &entity.Application{ID: "app-a", Name: "App A"}
	db.Create(app)
	secretKey := &entity.SecretKey{ID: "key-a", Name: "Key A", ApplicationID: "app-a", CreatedBy: "test-user-id", Active: true}
	plainKey, _ := secretKey.SetSecretKey()
	db.Create(secretKey)
	toggle := &entity.Toggle{ID: "toggle-a", Path: "feature.rollout", Enabled: false, AppID: "app-a", Value: "rollout", Level: 1}
	db.Create(toggle)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, disableToggleRequest("feature.rollout", plainKey))

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200 (idempotent) for an already-disabled toggle, got %d", w.Code)
	}
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

func TestGetTogglesBySecret_MissingHeader(t *testing.T) {
	router, _ := setupSecretKeyTestRouter()

	// Test without X-API-Key header
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/toggles", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected status 401, got %d", w.Code)
	}

	var response map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &response)

	if response["error"] == nil {
		t.Error("Expected error message")
	}
}

func TestGetTogglesBySecret_InvalidSecret(t *testing.T) {
	router, _ := setupSecretKeyTestRouter()

	// Test with invalid secret key
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/toggles", nil)
	req.Header.Set("X-API-Key", "invalid-secret")
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
		Active:        true,
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
	req, _ := http.NewRequest("GET", "/api/toggles", nil)
	req.Header.Set("X-API-Key", plainKey)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var response map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &response)

	if response["application"] == nil {
		t.Error("Expected application to be present")
	}

	application := response["application"].(map[string]interface{})

	if application["id"] != "test-app-id" {
		t.Error("Expected correct application id")
	}

	if application["name"] != "Test App" {
		t.Error("Expected correct application name")
	}

	if application["toggles"] == nil {
		t.Error("Expected toggles to be present")
	}
}

func TestGetTogglesBySecret_ExposesCanonicalRevisionWithoutSecretMaterial(t *testing.T) {
	router, db := setupSecretKeyTestRouter()
	plainKey := createCatalogueFixture(t, db)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/toggles", nil)
	req.Header.Set("X-API-Key", plainKey)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	etag := w.Header().Get("ETag")
	if len(etag) < 3 || etag[0] != '"' || etag[len(etag)-1] != '"' {
		t.Fatalf("expected a quoted ETag, got %q", etag)
	}

	var response map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	application, ok := response["application"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected application object, got %#v", response["application"])
	}
	revision, ok := application["revision"].(string)
	if !ok || revision == "" {
		t.Fatalf("expected a non-empty application revision, got %#v", application["revision"])
	}
	if etag != `"`+revision+`"` {
		t.Fatalf("expected ETag to contain response revision, got %q and %q", etag, revision)
	}
	if strings.Contains(w.Body.String(), plainKey) {
		t.Fatal("catalogue response must never contain secret key material")
	}
}

func TestGetTogglesBySecret_ReturnsNotModifiedForMatchingWeakOrListedETag(t *testing.T) {
	router, db := setupSecretKeyTestRouter()
	plainKey := createCatalogueFixture(t, db)

	first := httptest.NewRecorder()
	initialRequest := httptest.NewRequest(http.MethodGet, "/api/toggles", nil)
	initialRequest.Header.Set("X-API-Key", plainKey)
	router.ServeHTTP(first, initialRequest)
	if first.Code != http.StatusOK {
		t.Fatalf("expected initial status 200, got %d", first.Code)
	}

	for _, ifNoneMatch := range []string{first.Header().Get("ETag"), "W/" + first.Header().Get("ETag"), `"other", ` + first.Header().Get("ETag"), "*"} {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/toggles", nil)
		req.Header.Set("X-API-Key", plainKey)
		req.Header.Set("If-None-Match", ifNoneMatch)
		router.ServeHTTP(w, req)

		if w.Code != http.StatusNotModified {
			t.Errorf("If-None-Match %q: expected status 304, got %d", ifNoneMatch, w.Code)
		}
		if w.Body.Len() != 0 {
			t.Errorf("If-None-Match %q: expected empty 304 body, got %q", ifNoneMatch, w.Body.String())
		}
		if w.Header().Get("ETag") != first.Header().Get("ETag") {
			t.Errorf("If-None-Match %q: expected response ETag %q, got %q", ifNoneMatch, first.Header().Get("ETag"), w.Header().Get("ETag"))
		}
	}
}

func TestGetTogglesBySecret_RevisionChangesOnlyWhenVisibleCatalogueChanges(t *testing.T) {
	router, db := setupSecretKeyTestRouter()
	plainKey := createCatalogueFixture(t, db)

	readRevision := func() string {
		t.Helper()
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/toggles", nil)
		req.Header.Set("X-API-Key", plainKey)
		router.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d", w.Code)
		}
		var response struct {
			Application struct {
				Revision string `json:"revision"`
			} `json:"application"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
			t.Fatalf("unmarshal response: %v", err)
		}
		return response.Application.Revision
	}

	initial := readRevision()
	if same := readRevision(); same != initial {
		t.Fatalf("revision must be stable when catalogue is unchanged: %q != %q", same, initial)
	}

	var toggle entity.Toggle
	if err := db.Where("id = ?", "catalogue-toggle").First(&toggle).Error; err != nil {
		t.Fatalf("load fixture toggle: %v", err)
	}
	toggle.Enabled = false
	if err := db.Save(&toggle).Error; err != nil {
		t.Fatalf("disable fixture toggle: %v", err)
	}
	afterState := readRevision()
	if afterState == initial {
		t.Fatal("revision must change when a visible toggle state changes")
	}

	toggle.ActivationRule = &entity.ActivationRule{
		Type:   entity.ActivationRuleTypeAttribute,
		Value:  "premium",
		Config: json.RawMessage(`{"context_key":"attributes.plan"}`),
	}
	toggle.HasActivationRule = true
	if err := db.Save(&toggle).Error; err != nil {
		t.Fatalf("set fixture rule: %v", err)
	}
	afterRule := readRevision()
	if afterRule == afterState {
		t.Fatal("revision must change when visible rule context configuration changes")
	}

	if err := db.Model(&entity.Application{}).Where("id = ?", "catalogue-app").Update("name", "Renamed Catalogue").Error; err != nil {
		t.Fatalf("rename application: %v", err)
	}
	if afterApplicationChange := readRevision(); afterApplicationChange == afterRule {
		t.Fatal("revision must change when a visible application field changes")
	}
}

func TestGetTogglesBySecret_DoesNotEvaluateConditionalRequestBeforeAuthentication(t *testing.T) {
	router, db := setupSecretKeyTestRouter()
	plainKey := createCatalogueFixture(t, db)

	valid := httptest.NewRecorder()
	validRequest := httptest.NewRequest(http.MethodGet, "/api/toggles", nil)
	validRequest.Header.Set("X-API-Key", plainKey)
	router.ServeHTTP(valid, validRequest)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/toggles", nil)
	req.Header.Set("If-None-Match", valid.Header().Get("ETag"))
	router.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected unauthenticated conditional request to return 401, got %d", w.Code)
	}
	if w.Header().Get("ETag") != "" {
		t.Fatalf("unauthenticated response must not expose catalogue revision, got %q", w.Header().Get("ETag"))
	}

	invalid := httptest.NewRecorder()
	invalidRequest := httptest.NewRequest(http.MethodGet, "/api/toggles", nil)
	invalidRequest.Header.Set("X-API-Key", "not-a-valid-key")
	invalidRequest.Header.Set("If-None-Match", valid.Header().Get("ETag"))
	router.ServeHTTP(invalid, invalidRequest)
	if invalid.Code != http.StatusNotFound {
		t.Fatalf("expected invalid conditional request to return 404, got %d", invalid.Code)
	}
	if invalid.Header().Get("ETag") != "" {
		t.Fatalf("invalid-key response must not expose catalogue revision, got %q", invalid.Header().Get("ETag"))
	}
}

func createCatalogueFixture(t *testing.T, db *gorm.DB) string {
	t.Helper()
	if err := db.Create(&entity.Application{ID: "catalogue-app", Name: "Catalogue App"}).Error; err != nil {
		t.Fatalf("create application: %v", err)
	}
	secretKey := &entity.SecretKey{ID: "catalogue-key", Name: "Catalogue Key", ApplicationID: "catalogue-app", CreatedBy: "test-user-id", Active: true}
	plainKey, err := secretKey.SetSecretKey()
	if err != nil {
		t.Fatalf("create secret: %v", err)
	}
	if err := db.Create(secretKey).Error; err != nil {
		t.Fatalf("persist secret: %v", err)
	}
	if err := db.Create(&entity.Toggle{ID: "catalogue-toggle", Path: "catalogue.feature", Enabled: true, AppID: "catalogue-app", Value: "feature", Level: 1}).Error; err != nil {
		t.Fatalf("create toggle: %v", err)
	}
	return plainKey
}

func TestSecretKeyRegeneration(t *testing.T) {
	// Create separate router for this test to avoid database conflicts
	gin.SetMode(gin.TestMode)

	// Cria base de dados em memória para testes
	db, _ := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})

	// Auto migrate tables
	db.AutoMigrate(&entity.Application{}, &entity.Toggle{}, &entity.User{}, &entity.SecretKey{}, &entity.Session{})

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

	router.GET("/api/toggles", GetTogglesBySecret)

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

	// v2.6 §5.1: regenerar deixou de apagar a chave anterior na hora — ela vira "previous" e
	// continua autenticando durante a janela de overlap, pra não quebrar consumidores que ainda
	// não atualizaram pra chave nova. Ver TestSecretKeyRegeneration_RotatingAgainRevokesTheOldestPreviousKey
	// pro caso "e uma TERCEIRA chave", onde a primeira finalmente deixa de funcionar.
	w3 := httptest.NewRecorder()
	req3, _ := http.NewRequest("GET", "/api/toggles", nil)
	req3.Header.Set("X-API-Key", firstKey)
	router.ServeHTTP(w3, req3)

	if w3.Code != http.StatusOK {
		t.Errorf("expected the previous key to still authenticate during the overlap window, got status %d", w3.Code)
	}

	// Second key should work
	w4 := httptest.NewRecorder()
	req4, _ := http.NewRequest("GET", "/api/toggles", nil)
	req4.Header.Set("X-API-Key", secondKey)
	router.ServeHTTP(w4, req4)

	if w4.Code != http.StatusOK {
		t.Errorf("Expected status 200 for new key, got %d", w4.Code)
	}
}

// Só há espaço pra 1 "previous" por vez (mesmo modelo do protótipo real: KEYS[appId] =
// {current, previous}) — uma TERCEIRA rotação empurra a mais antiga (a primeira chave gerada) pra
// fora de vez, revogada.
func TestSecretKeyRegeneration_RotatingAgainRevokesTheOldestPreviousKey(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, _ := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	db.AutoMigrate(&entity.Application{}, &entity.Toggle{}, &entity.User{}, &entity.SecretKey{}, &entity.Session{})
	InitHandlers(db)

	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("user", &entity.User{ID: "test-user-id", Username: "testuser"})
		c.Next()
	})
	applications := router.Group("/applications")
	{
		applications.POST("/:id/generate-secret", GenerateSecretKey)
	}
	router.GET("/api/toggles", GetTogglesBySecret)

	db.Create(&entity.Application{ID: "test-app-id", Name: "Test App"})

	generate := func() string {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/applications/test-app-id/generate-secret", nil)
		router.ServeHTTP(w, req)
		var resp map[string]interface{}
		json.Unmarshal(w.Body.Bytes(), &resp)
		return resp["plain_key"].(string)
	}
	authenticates := func(key string) bool {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/api/toggles", nil)
		req.Header.Set("X-API-Key", key)
		router.ServeHTTP(w, req)
		return w.Code == http.StatusOK
	}

	first := generate()
	second := generate()
	third := generate()

	if authenticates(first) {
		t.Error("expected the oldest key to have been revoked by the second rotation")
	}
	if !authenticates(second) {
		t.Error("expected the now-previous key to still authenticate")
	}
	if !authenticates(third) {
		t.Error("expected the current key to authenticate")
	}
}
