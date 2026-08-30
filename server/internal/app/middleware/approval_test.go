package middleware

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/manorfm/totoogle/internal/app/domain/entity"
)

func testContext(method, path, body string) *gin.Context {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	var req *http.Request
	if body == "" {
		req = httptest.NewRequest(method, path, nil)
	} else {
		req = httptest.NewRequest(method, path, strings.NewReader(body))
	}
	c.Request = req
	return c
}

func TestGetActionType(t *testing.T) {
	tests := []struct {
		name   string
		method string
		path   string
		body   string
		want   entity.ApprovalActionType
	}{
		// Regressão: os 5 tipos já suportados antes desta mudança.
		{"create application", "POST", "/api/applications", "", entity.ApprovalActionApplicationCreate},
		{"update application", "PUT", "/api/applications/app1", "", entity.ApprovalActionApplicationCreate},
		{"delete application", "DELETE", "/api/applications/app1", "", entity.ApprovalActionApplicationDelete},
		{"create toggle", "POST", "/api/applications/app1/toggles", `{"toggle":"a.b"}`, entity.ApprovalActionToggleCreate},
		{"delete toggle", "DELETE", "/api/applications/app1/toggles/tg1", "", entity.ApprovalActionToggleDelete},
		{"plain toggle update (no rule in body)", "PUT", "/api/applications/app1/toggles/tg1", `{"enabled":true,"has_activation_rule":false}`, entity.ApprovalActionToggleUpdate},

		// Novos: secret keys — ordering-sensitive (generate-secret também contém "/applications").
		{"generate secret key not misclassified as application create", "POST", "/api/applications/app1/generate-secret", "", entity.ApprovalActionSecretKeyCreate},
		{"delete secret key", "DELETE", "/api/secret-keys/key1", "", entity.ApprovalActionSecretKeyDelete},

		// Novos: toggle_rule vs toggle_update no mesmo endpoint plural, decidido pelo corpo.
		{"toggle update with has_activation_rule true classifies as rule", "PUT", "/api/applications/app1/toggles/tg1", `{"enabled":true,"has_activation_rule":true,"activation_rule":{"type":"percentage","value":"10"}}`, entity.ApprovalActionToggleRule},
		{"toggle update with non-null activation_rule classifies as rule", "PUT", "/api/applications/app1/toggles/tg1", `{"enabled":true,"has_activation_rule":false,"activation_rule":{"type":"percentage","value":"10"}}`, entity.ApprovalActionToggleRule},

		// Novos: toggle_enable/toggle_disable no endpoint recursivo singular — não confundir com o plural.
		{"recursive toggle enable", "PUT", "/api/applications/app1/toggle/tg1", `{"enabled":true}`, entity.ApprovalActionToggleEnable},
		{"recursive toggle disable", "PUT", "/api/applications/app1/toggle/tg1", `{"enabled":false}`, entity.ApprovalActionToggleDisable},
		{"recursive toggle without enabled in body falls back to update", "PUT", "/api/applications/app1/toggle/tg1", `{}`, entity.ApprovalActionToggleUpdate},

		{"unknown route", "GET", "/api/health", "", entity.ApprovalActionType("unknown")},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := testContext(tt.method, tt.path, tt.body)
			got := getActionType(c)
			if got != tt.want {
				t.Errorf("getActionType(%s %s, body=%q) = %q, want %q", tt.method, tt.path, tt.body, got, tt.want)
			}
		})
	}
}

func TestPeekJSONBody_RestoresBodyForLaterReads(t *testing.T) {
	c := testContext("PUT", "/api/applications/app1/toggles/tg1", `{"enabled":true}`)

	body := peekJSONBody(c)
	if body == nil {
		t.Fatal("expected non-nil body map")
	}
	if enabled, ok := body["enabled"].(bool); !ok || !enabled {
		t.Errorf("expected enabled=true in peeked body, got %v", body["enabled"])
	}

	// O corpo precisa continuar legível depois do peek (createApprovalRequest lê de novo).
	remaining, err := io.ReadAll(c.Request.Body)
	if err != nil {
		t.Fatalf("failed to re-read body after peek: %v", err)
	}
	if string(remaining) != `{"enabled":true}` {
		t.Errorf("expected body to be restored intact, got %q", string(remaining))
	}
}

func TestPeekJSONBody_NilBody(t *testing.T) {
	c := testContext("DELETE", "/api/secret-keys/key1", "")
	if body := peekJSONBody(c); body != nil {
		t.Errorf("expected nil map for empty body, got %v", body)
	}
}
