package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// setupFavoriteIntegrationTestRouter prova de ponta a ponta (banco real, handlers reais) que
// favoritos agora persistem no servidor por usuário — v2.6 §6.4 era puramente localStorage, o que
// perdia o favorito ao trocar de navegador/dispositivo ou reportava "sumir" ao deslogar em alguns
// fluxos; a fonte de verdade agora é o servidor, escopada ao usuário do token de sessão.
func setupFavoriteIntegrationTestRouter(t *testing.T) (router *gin.Engine, userA, userB *entity.User) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	if err := db.AutoMigrate(&entity.User{}, &entity.UserFavorite{}); err != nil {
		t.Fatalf("failed to migrate: %v", err)
	}

	InitHandlers(db)

	userA = &entity.User{ID: "user-a", Name: "User A", Username: "user-a", Role: entity.UserRoleUser}
	userB = &entity.User{ID: "user-b", Name: "User B", Username: "user-b", Role: entity.UserRoleUser}
	for _, u := range []*entity.User{userA, userB} {
		if err := db.Create(u).Error; err != nil {
			t.Fatalf("failed to create user %s: %v", u.Username, err)
		}
	}

	router = gin.New()
	router.Use(func(c *gin.Context) {
		switch c.GetHeader("X-Test-User") {
		case userA.ID:
			c.Set("user", userA)
		case userB.ID:
			c.Set("user", userB)
		}
		c.Next()
	})
	router.GET("/profile/favorites", ListFavorites)
	router.POST("/profile/favorites", AddFavorite)
	router.DELETE("/profile/favorites", RemoveFavorite)

	return router, userA, userB
}

func doFavoriteRequest(t *testing.T, router *gin.Engine, method, userID string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var reqBody *bytes.Buffer
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("failed to marshal body: %v", err)
		}
		reqBody = bytes.NewBuffer(raw)
	} else {
		reqBody = bytes.NewBuffer(nil)
	}
	req := httptest.NewRequest(method, "/profile/favorites", reqBody)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Test-User", userID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func favoritesFromResponse(t *testing.T, w *httptest.ResponseRecorder) []string {
	t.Helper()
	var body struct {
		Favorites []string `json:"favorites"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("failed to decode response: %v (body: %s)", err, w.Body.String())
	}
	return body.Favorites
}

func TestFavoriteIntegration_AddPersistsAndListsBackForTheSameUser(t *testing.T) {
	router, userA, _ := setupFavoriteIntegrationTestRouter(t)

	w := doFavoriteRequest(t, router, http.MethodPost, userA.ID, map[string]string{"key": "app:app-1"})
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 adding a favorite, got %d (body: %s)", w.Code, w.Body.String())
	}

	w = doFavoriteRequest(t, router, http.MethodGet, userA.ID, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 listing favorites, got %d", w.Code)
	}
	favs := favoritesFromResponse(t, w)
	if len(favs) != 1 || favs[0] != "app:app-1" {
		t.Fatalf("expected [app:app-1], got %v", favs)
	}
}

// Regressão do bug reportado: favoritos precisam sobreviver a um novo login — simulado aqui
// como uma nova sequência de requisições autenticadas como o mesmo usuário, sem nenhum estado de
// navegador entre elas (o que o localStorage exigia implicitamente).
func TestFavoriteIntegration_SurvivesANewLoginSession(t *testing.T) {
	router, userA, _ := setupFavoriteIntegrationTestRouter(t)

	doFavoriteRequest(t, router, http.MethodPost, userA.ID, map[string]string{"key": "tg:app-1:payments.card"})

	// "novo login" = uma nova requisição autenticada, sem nada compartilhado com a anterior além
	// do próprio ID do usuário (que é exatamente o que uma sessão de verdade também garante).
	w := doFavoriteRequest(t, router, http.MethodGet, userA.ID, nil)
	favs := favoritesFromResponse(t, w)
	if len(favs) != 1 || favs[0] != "tg:app-1:payments.card" {
		t.Fatalf("expected the favorite to survive into a new session, got %v", favs)
	}
}

func TestFavoriteIntegration_RemoveDeletesIt(t *testing.T) {
	router, userA, _ := setupFavoriteIntegrationTestRouter(t)

	doFavoriteRequest(t, router, http.MethodPost, userA.ID, map[string]string{"key": "app:app-1"})
	w := doFavoriteRequest(t, router, http.MethodDelete, userA.ID, map[string]string{"key": "app:app-1"})
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 removing a favorite, got %d (body: %s)", w.Code, w.Body.String())
	}

	w = doFavoriteRequest(t, router, http.MethodGet, userA.ID, nil)
	favs := favoritesFromResponse(t, w)
	if len(favs) != 0 {
		t.Fatalf("expected no favorites left, got %v", favs)
	}
}

func TestFavoriteIntegration_ScopedPerUser(t *testing.T) {
	router, userA, userB := setupFavoriteIntegrationTestRouter(t)

	doFavoriteRequest(t, router, http.MethodPost, userA.ID, map[string]string{"key": "app:app-1"})

	w := doFavoriteRequest(t, router, http.MethodGet, userB.ID, nil)
	favs := favoritesFromResponse(t, w)
	if len(favs) != 0 {
		t.Fatalf("expected userB to never see userA's favorites, got %v", favs)
	}
}

func TestFavoriteIntegration_AddRejectsMissingKey(t *testing.T) {
	router, userA, _ := setupFavoriteIntegrationTestRouter(t)

	w := doFavoriteRequest(t, router, http.MethodPost, userA.ID, map[string]string{})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for a missing key, got %d", w.Code)
	}
}
