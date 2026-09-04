package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/manorfm/totoogle/internal/app/domain/auth"
	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/infrastructure/database"
	"github.com/manorfm/totoogle/internal/app/usecase"
)

// ValidateToken must only accept the session via the auth_token cookie. The historical
// "Authorization: Bearer <token>" fallback ("for API compatibility") had no real caller anywhere
// in this monorepo — the frontend always sends `credentials: "include"` (cookie), never that
// header, and no client library or existing test ever exercised it either — so it's removed as
// dead/unverified code.
func TestValidateToken_OnlyAcceptsCookie_NotAuthorizationHeaderFallback(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}
	if err := db.AutoMigrate(&entity.User{}, &entity.Session{}); err != nil {
		t.Fatalf("failed to migrate test db: %v", err)
	}

	userRepo := database.NewUserRepository(db)
	sessionRepo := database.NewSessionRepository(db)
	authManager := auth.NewAuthManager()
	authUseCase := usecase.NewAuthUseCase(userRepo, authManager, sessionRepo, t.TempDir()+"/initial-root-password.txt")

	user := &entity.User{Username: "tester", Password: "irrelevant-not-exercised-here", Role: entity.UserRoleAdmin, Active: true}
	if err := userRepo.Create(user); err != nil {
		t.Fatalf("failed to seed test user: %v", err)
	}

	session, rawToken, err := entity.NewSession(user.ID, entity.SessionPurposeAuth, time.Hour)
	if err != nil {
		t.Fatalf("failed to build session: %v", err)
	}
	if err := sessionRepo.Create(session); err != nil {
		t.Fatalf("failed to store session: %v", err)
	}

	authHandler := NewAuthHandler(authUseCase, nil) // auditUseCase not exercised in this test
	router := gin.New()
	router.GET("/protected", authHandler.ValidateToken(), func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	t.Run("cookie is accepted", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/protected", nil)
		req.AddCookie(&http.Cookie{Name: "auth_token", Value: rawToken})
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected 200 with a valid cookie, got %d", w.Code)
		}
	})

	t.Run("Authorization header alone is rejected", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/protected", nil)
		req.Header.Set("Authorization", "Bearer "+rawToken)
		router.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Errorf("expected 401 for a token presented only via Authorization header (no cookie), got %d", w.Code)
		}
	})
}
