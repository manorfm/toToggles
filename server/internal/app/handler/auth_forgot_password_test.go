package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

// v2.6 §5.5: "forgot password" self-service, sem e-mail — só registra um evento de auditoria que
// um root/admin vê em History e age sobre (POST /users/:id/reset-password já existe). Reusa
// setupAuditIntegrationTestRouter (banco real, handlers reais) e adiciona a rota de
// forgot-password nele — mesmo padrão de todo outro teste deste arquivo.
func setupForgotPasswordTestRouter(t *testing.T) (router *gin.Engine, teamAdminUsername, rootID string) {
	t.Helper()
	r, _, teamAdmin, _, root := setupAuditIntegrationTestRouter(t)
	r.POST("/auth/forgot-password", ForgotPassword)
	return r, teamAdmin.Username, root.ID
}

func TestForgotPassword_ExistingUsername_AlwaysReturnsSuccessAndRecordsAnAuditEvent(t *testing.T) {
	router, username, rootID := setupForgotPasswordTestRouter(t)

	req := httptest.NewRequest(http.MethodPost, "/auth/forgot-password", strings.NewReader(`{"username":"`+username+`"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Success bool `json:"success"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	if !resp.Success {
		t.Error("expected success:true")
	}

	// Root vê o evento (evento global, team_id nil — mesma regra de approval_system_toggled).
	text, target := latestAuditTextAndTarget(t, router, rootID, "password_reset_requested")
	if want := "Password reset requested for <b>@" + username + "</b>"; text != want {
		t.Errorf("expected text %q, got %q", want, text)
	}
	if want := "Self-service (login screen)"; target != want {
		t.Errorf("expected target %q, got %q", want, target)
	}
}

func TestForgotPassword_NonexistentUsername_StillReturnsSuccessButRecordsNothing(t *testing.T) {
	router, _, rootID := setupForgotPasswordTestRouter(t)

	req := httptest.NewRequest(http.MethodPost, "/auth/forgot-password", strings.NewReader(`{"username":"nobody-at-all"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 (never reveals whether the username exists), got %d: %s", w.Code, w.Body.String())
	}

	auditReq := httptest.NewRequest(http.MethodGet, "/audit", nil)
	auditReq.Header.Set("X-Test-User", rootID)
	auditW := httptest.NewRecorder()
	router.ServeHTTP(auditW, auditReq)
	if strings.Contains(auditW.Body.String(), "password_reset_requested") {
		t.Error("expected no password_reset_requested event for a username that doesn't exist")
	}
}

func TestForgotPassword_MissingUsername_Returns400(t *testing.T) {
	router, _, _ := setupForgotPasswordTestRouter(t)

	req := httptest.NewRequest(http.MethodPost, "/auth/forgot-password", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for a missing username, got %d", w.Code)
	}
}
