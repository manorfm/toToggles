package handler

import (
	"bytes"
	"context"
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

// setupAuditIntegrationTestRouter espelha setupApprovalWorkflowTestRouter (mesmo schema patch
// pra team_users/team_applications), mas com DOIS times/usuários — pra provar de ponta a ponta
// (banco real, handlers reais, sem mock) que um evento gravado numa mutação real só é visível
// pra quem tem acesso ao time (domain/policy.AuditAccess), não pra qualquer autenticado.
func setupAuditIntegrationTestRouter(t *testing.T) (router *gin.Engine, db *gorm.DB, teamAdmin, otherTeamAdmin, root *entity.User) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	if err := db.AutoMigrate(
		&entity.User{}, &entity.Team{}, &entity.Application{},
		&entity.Toggle{}, &entity.SecretKey{}, &entity.Session{},
		&entity.ApprovalRequest{}, &entity.ApprovalSettings{}, &entity.AuditLog{},
	); err != nil {
		t.Fatalf("failed to migrate: %v", err)
	}
	for _, stmt := range []string{
		"ALTER TABLE team_users ADD COLUMN is_approver boolean DEFAULT false",
		"ALTER TABLE team_users ADD COLUMN created_at datetime",
		"ALTER TABLE team_users ADD COLUMN updated_at datetime",
		"ALTER TABLE team_applications ADD COLUMN permission varchar(20) DEFAULT 'read'",
		"ALTER TABLE team_applications ADD COLUMN created_at datetime",
		"ALTER TABLE team_applications ADD COLUMN updated_at datetime",
	} {
		if err := db.Exec(stmt).Error; err != nil {
			t.Fatalf("failed to patch join table schema (%q): %v", stmt, err)
		}
	}

	InitHandlers(db)

	teamAdmin = &entity.User{ID: "admin-1", Username: "admin1", Role: entity.UserRoleAdmin}
	otherTeamAdmin = &entity.User{ID: "admin-2", Username: "admin2", Role: entity.UserRoleAdmin}
	// InitHandlers já seguiu seu próprio fluxo e criou um usuário "root" (InitializeRootUser) —
	// username diferente aqui só pra não colidir com esse, este é só mais um usuário de teste.
	root = &entity.User{ID: "root-1", Username: "root-test", Role: entity.UserRoleRoot}
	for _, u := range []*entity.User{teamAdmin, otherTeamAdmin, root} {
		if err := db.Create(u).Error; err != nil {
			t.Fatalf("failed to create user %s: %v", u.Username, err)
		}
	}

	team := &entity.Team{ID: "team-1", Name: "Team 1"}
	otherTeam := &entity.Team{ID: "team-2", Name: "Team 2"}
	for _, tm := range []*entity.Team{team, otherTeam} {
		if err := db.Create(tm).Error; err != nil {
			t.Fatalf("failed to create team %s: %v", tm.Name, err)
		}
	}
	if err := db.Create(&entity.TeamUser{TeamID: team.ID, UserID: teamAdmin.ID}).Error; err != nil {
		t.Fatalf("failed to associate teamAdmin to team-1: %v", err)
	}
	if err := db.Create(&entity.TeamUser{TeamID: otherTeam.ID, UserID: otherTeamAdmin.ID}).Error; err != nil {
		t.Fatalf("failed to associate otherTeamAdmin to team-2: %v", err)
	}

	router = gin.New()
	router.Use(func(c *gin.Context) {
		// Rota de teste lê o usuário-ator de um header — só existe neste harness de teste, pra
		// poder trocar de "quem está autenticado" entre requisições sem reconstruir o router.
		switch c.GetHeader("X-Test-User") {
		case teamAdmin.ID:
			c.Set("user", teamAdmin)
		case otherTeamAdmin.ID:
			c.Set("user", otherTeamAdmin)
		case root.ID:
			c.Set("user", root)
		}
		c.Next()
	})
	router.POST("/applications", RequireApprovalAware(entity.UserRoleAdmin), CreateApplication)
	router.POST("/applications/:id/toggles", RequireApprovalAware(entity.UserRoleAdmin), CreateToggle)
	router.PUT("/applications/:id/toggles/:toggleId", RequireApprovalAware(entity.UserRoleAdmin), UpdateToggle)
	router.POST("/applications/:id/generate-secret", RequireApprovalAware(entity.UserRoleAdmin), GenerateSecretKey)
	router.POST("/teams/:id/users", AddUserToTeam)
	router.GET("/audit", GetAuditLog)

	return router, db, teamAdmin, otherTeamAdmin, root
}

// latestAuditText devolve o `text` do evento mais recente de um dado event_type visível pra
// userID — usado pelos testes de texto abaixo, que checam o CONTEÚDO exato da mensagem (não só
// que um evento existe), conferido contra os `logAudit(...)` reais do protótipo.
func latestAuditText(t *testing.T, router *gin.Engine, userID, eventType string) string {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/audit", nil)
	req.Header.Set("X-Test-User", userID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 from GET /audit, got %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Data []struct {
			EventType string `json:"event_type"`
			Text      string `json:"text"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	for _, e := range resp.Data {
		if e.EventType == eventType {
			return e.Text
		}
	}
	t.Fatalf("no %q event found in %+v", eventType, resp.Data)
	return ""
}

func TestAuditIntegration_ApplicationCreate_VisibleOnlyToTeamAndRoot(t *testing.T) {
	router, _, teamAdmin, otherTeamAdmin, root := setupAuditIntegrationTestRouter(t)

	// teamAdmin cria uma aplicação em team-1 — mutação real, sem approval workflow (desligado
	// por padrão nesta fixture), então cai no caminho de execução imediata (handler grava o
	// evento direto, não via ApprovalUseCase).
	body, _ := json.Marshal(map[string]string{"name": "Checkout Web", "team_id": "team-1"})
	req := httptest.NewRequest(http.MethodPost, "/applications", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Test-User", teamAdmin.ID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 creating the application, got %d: %s", w.Code, w.Body.String())
	}

	assertAuditVisible := func(t *testing.T, userID string, wantVisible bool) {
		t.Helper()
		req := httptest.NewRequest(http.MethodGet, "/audit", nil)
		req.Header.Set("X-Test-User", userID)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 from GET /audit, got %d: %s", w.Code, w.Body.String())
		}
		var resp struct {
			Data []struct {
				EventType string `json:"event_type"`
				Text      string `json:"text"`
			} `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("invalid JSON response: %v", err)
		}
		found := false
		for _, e := range resp.Data {
			if e.EventType == "application_created" {
				found = true
			}
		}
		if found != wantVisible {
			t.Errorf("user %s: expected application_created visible=%v, got data=%+v", userID, wantVisible, resp.Data)
		}
	}

	t.Run("visible to the team's own member", func(t *testing.T) {
		assertAuditVisible(t, teamAdmin.ID, true)
	})
	t.Run("visible to root", func(t *testing.T) {
		assertAuditVisible(t, root.ID, true)
	})
	t.Run("invisible to an admin of a different team", func(t *testing.T) {
		assertAuditVisible(t, otherTeamAdmin.ID, false)
	})
}

// Os 3 testes abaixo travam achados reais de uma auditoria pedida pelo usuário ("ícones, cores,
// textos divergem [do protótipo]") — cada um reproduz um texto que estava incompleto/errado
// antes da correção, conferido contra o `logAudit(...)` real do protótipo (app.jsx).

func TestAuditIntegration_ToggleRuleSet_TextIncludesPercentageValue(t *testing.T) {
	router, db, teamAdmin, _, _ := setupAuditIntegrationTestRouter(t)

	app := &entity.Application{ID: "app-1", Name: "Checkout Web"}
	if err := db.Create(app).Error; err != nil {
		t.Fatalf("failed to create application: %v", err)
	}
	if err := db.Create(&entity.TeamApplication{TeamID: "team-1", ApplicationID: app.ID, Permission: entity.PermissionAdmin}).Error; err != nil {
		t.Fatalf("failed to associate application to team: %v", err)
	}
	toggle := &entity.Toggle{ID: "toggle-1", AppID: app.ID, Value: "rollout", Path: "rollout", Enabled: true}
	if err := db.Create(toggle).Error; err != nil {
		t.Fatalf("failed to create toggle: %v", err)
	}

	body := `{"enabled": true, "has_activation_rule": true, "activation_rule": {"type": "percentage", "value": "40"}}`
	req := httptest.NewRequest(http.MethodPut, "/applications/app-1/toggles/toggle-1", bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Test-User", teamAdmin.ID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 setting the rule, got %d: %s", w.Code, w.Body.String())
	}

	got := latestAuditText(t, router, teamAdmin.ID, "toggle_rule_set")
	want := "Set percentage rule to 40%"
	if got != want {
		t.Errorf("expected audit text %q, got %q", want, got)
	}
}

func TestAuditIntegration_KeyGenerate_SaysRotatedOnSecondCall(t *testing.T) {
	router, db, teamAdmin, _, _ := setupAuditIntegrationTestRouter(t)

	app := &entity.Application{ID: "app-1", Name: "Checkout Web"}
	if err := db.Create(app).Error; err != nil {
		t.Fatalf("failed to create application: %v", err)
	}
	if err := db.Create(&entity.TeamApplication{TeamID: "team-1", ApplicationID: app.ID, Permission: entity.PermissionAdmin}).Error; err != nil {
		t.Fatalf("failed to associate application to team: %v", err)
	}

	generate := func() {
		req := httptest.NewRequest(http.MethodPost, "/applications/app-1/generate-secret", nil)
		req.Header.Set("X-Test-User", teamAdmin.ID)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 generating the key, got %d: %s", w.Code, w.Body.String())
		}
	}

	generate()
	if got := latestAuditText(t, router, teamAdmin.ID, "key_generated"); got != "Generated service key" {
		t.Errorf("expected the first generation to say 'Generated service key', got %q", got)
	}

	generate()
	if got := latestAuditText(t, router, teamAdmin.ID, "key_generated"); got != "Rotated service key" {
		t.Errorf("expected the second generation (a key already existed) to say 'Rotated service key', got %q", got)
	}
}

func TestAuditIntegration_MemberAdded_TextIncludesTheAddedUsersUsername(t *testing.T) {
	router, db, teamAdmin, _, _ := setupAuditIntegrationTestRouter(t)

	newMember := &entity.User{ID: "user-new", Username: "bea"}
	if err := db.Create(newMember).Error; err != nil {
		t.Fatalf("failed to create the user to add: %v", err)
	}

	body, _ := json.Marshal(map[string]string{"user_id": newMember.ID})
	req := httptest.NewRequest(http.MethodPost, "/teams/team-1/users", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Test-User", teamAdmin.ID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 adding the member, got %d: %s", w.Code, w.Body.String())
	}

	got := latestAuditText(t, router, teamAdmin.ID, "member_added")
	want := "Added @bea"
	if got != want {
		t.Errorf("expected audit text %q, got %q", want, got)
	}
}

// Reproduz o achado ao vivo que motivou esta rodada de correções: com o workflow de aprovação
// ligado, o History só mostrava "root aprovou X" — nunca "manoel.medeiros pediu X", nem "X
// aconteceu". Prova as duas pontas fechadas: o pedido é gravado com o SOLICITANTE como actor
// (approval_requested), e a execução de verdade grava o evento de domínio (toggle_created),
// separado do approval_approved que ApproveRequest já gravava.
func TestAuditIntegration_ApprovalFlow_RecordsRequesterAndExecutionEvents(t *testing.T) {
	router, db, teamAdmin, _, root := setupAuditIntegrationTestRouter(t)

	app := &entity.Application{ID: "app-1", Name: "Checkout Web"}
	if err := db.Create(app).Error; err != nil {
		t.Fatalf("failed to create application: %v", err)
	}
	if err := db.Create(&entity.TeamApplication{TeamID: "team-1", ApplicationID: app.ID, Permission: entity.PermissionAdmin}).Error; err != nil {
		t.Fatalf("failed to associate application to team: %v", err)
	}

	enabled := true
	if _, err := globalApprovalUseCase.UpdateApprovalSettings(context.Background(), root.ID, &entity.UpdateApprovalSettingsRequest{
		ApprovalEnabled: &enabled,
		RequiredActions: &entity.ApprovalConfig{ToggleCreate: true},
	}); err != nil {
		t.Fatalf("failed to enable approval settings: %v", err)
	}

	body := `{"toggle": "payments.new-feature"}`
	req := httptest.NewRequest(http.MethodPost, "/applications/app-1/toggles", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Test-User", teamAdmin.ID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusAccepted {
		t.Fatalf("expected 202 (intercepted by the approval workflow), got %d: %s", w.Code, w.Body.String())
	}

	requestedText := latestAuditText(t, router, teamAdmin.ID, "approval_requested")
	if !strings.Contains(requestedText, "Create toggle") {
		t.Errorf("expected the approval_requested text to mention what was requested, got %q", requestedText)
	}

	var pending entity.ApprovalRequest
	if err := db.Where("action_type = ?", entity.ApprovalActionToggleCreate).First(&pending).Error; err != nil {
		t.Fatalf("expected a pending toggle_create request, got: %v", err)
	}

	ctx := context.Background()
	if err := globalApprovalUseCase.ApproveRequest(ctx, pending.ID, root); err != nil {
		t.Fatalf("failed to approve request: %v", err)
	}
	if err := globalApprovalUseCase.ExecuteApprovedAction(ctx, pending.ID, root); err != nil {
		t.Fatalf("failed to execute approved action: %v", err)
	}

	createdText := latestAuditText(t, router, root.ID, "toggle_created")
	if !strings.HasSuffix(createdText, "(after approval)") {
		t.Errorf("expected the execution event's text to end with '(after approval)', got %q", createdText)
	}

	approvedText := latestAuditText(t, router, root.ID, "approval_approved")
	if approvedText == "" {
		t.Error("expected the approval_approved event to still be recorded alongside the execution event")
	}
}
