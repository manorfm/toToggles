package handler

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
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

// setupApprovalWorkflowTestRouter builds a real sqlite-backed router (mirrors
// setupSecretKeyTestRouter) with an admin user already assigned to a team that owns an
// application — the minimum fixture needed to exercise RequireApprovalAware end-to-end for the
// 5 action types (toggle_enable, toggle_disable, toggle_rule, secret_key_create,
// secret_key_delete) that getActionType previously could not classify.
func setupApprovalWorkflowTestRouter(t *testing.T) (*gin.Engine, *gorm.DB, *entity.User) {
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
	// User/Team/Application também declaram team_users/team_applications via tag `many2many`,
	// que o passo acima já usou para criar essas duas tabelas — mas só com o schema mínimo dessa
	// tag (as duas FKs), sem as colunas extras que só existem nos structs explícitos
	// TeamUser/TeamApplication (`is_approver`/`permission`). Confirmado ao vivo:
	// `db.AutoMigrate(&entity.TeamUser{}, &entity.TeamApplication{})` depois disso não adiciona
	// essas colunas (GORM não detecta o diff nesse caso específico de tabela já existente via
	// many2many) — completa o schema via SQL direto.
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

	admin := &entity.User{ID: "admin-1", Username: "admin1", Role: entity.UserRoleAdmin}
	if err := db.Create(admin).Error; err != nil {
		t.Fatalf("failed to create admin: %v", err)
	}
	team := &entity.Team{ID: "team-1", Name: "Team 1"}
	if err := db.Create(team).Error; err != nil {
		t.Fatalf("failed to create team: %v", err)
	}
	if err := db.Create(&entity.TeamUser{TeamID: team.ID, UserID: admin.ID}).Error; err != nil {
		t.Fatalf("failed to associate user to team: %v", err)
	}

	app := &entity.Application{ID: "app-1", Name: "App 1"}
	if err := db.Create(app).Error; err != nil {
		t.Fatalf("failed to create application: %v", err)
	}
	if err := db.Create(&entity.TeamApplication{TeamID: team.ID, ApplicationID: app.ID, Permission: entity.PermissionAdmin}).Error; err != nil {
		t.Fatalf("failed to associate application to team: %v", err)
	}

	router := gin.New()
	router.Use(func(c *gin.Context) {
		// SuggestToggleChange's tests need a caller other than admin (a plain-role team member) —
		// falls back to admin (every existing test's expectation) when the header is absent.
		if actorID := c.GetHeader("X-Test-User"); actorID != "" {
			var actor entity.User
			if err := db.First(&actor, "id = ?", actorID).Error; err == nil {
				c.Set("user", &actor)
				c.Next()
				return
			}
		}
		c.Set("user", admin)
		c.Next()
	})
	router.POST("/applications/:id/generate-secret", RequireApprovalAware(entity.UserRoleAdmin), GenerateSecretKey)
	router.DELETE("/secret-keys/:id", RequireApprovalAware(entity.UserRoleAdmin), DeleteSecretKey)
	router.PUT("/applications/:id/toggle/:toggleId", RequireApprovalAware(entity.UserRoleAdmin), UpdateEnabled)
	router.PUT("/applications/:id/toggles/bulk", RequireApprovalAware(entity.UserRoleAdmin), BulkUpdateEnabled)
	router.PUT("/applications/:id/toggles/:toggleId", RequireApprovalAware(entity.UserRoleAdmin), UpdateToggle)
	router.PUT("/applications/:id", RequireApprovalAware(entity.UserRoleAdmin), UpdateApplication)
	router.POST("/applications", RequireApprovalAware(entity.UserRoleAdmin), CreateApplication)
	router.POST("/applications/:id/toggles/:toggleId/suggest", SuggestToggleChange)

	return router, db, admin
}

// enableApproval turns on the workflow and requires exactly the given action types, bypassing
// HTTP (root-only) by calling the use case directly with a seeded root user. Returns that root
// user so callers can also approve/execute directly against the use case without a second seed.
func enableApproval(t *testing.T, db *gorm.DB, required entity.ApprovalConfig) *entity.User {
	t.Helper()
	root := &entity.User{ID: "root-1", Username: "root1", Role: entity.UserRoleRoot}
	if err := db.Create(root).Error; err != nil {
		t.Fatalf("failed to create root: %v", err)
	}
	enabled := true
	_, err := globalApprovalUseCase.UpdateApprovalSettings(context.Background(), root.ID, &entity.UpdateApprovalSettingsRequest{
		ApprovalEnabled: &enabled,
		RequiredActions: &required,
	})
	if err != nil {
		t.Fatalf("failed to enable approval settings: %v", err)
	}
	return root
}

func TestApprovalWorkflow_SecretKeyDelete_Intercepted(t *testing.T) {
	router, db, _ := setupApprovalWorkflowTestRouter(t)
	enableApproval(t, db, entity.ApprovalConfig{SecretKeyDelete: true})

	key := &entity.SecretKey{ID: "key-1", Name: "API Access Key", ApplicationID: "app-1", CreatedBy: "admin-1", KeyHash: "hash"}
	if err := db.Create(key).Error; err != nil {
		t.Fatalf("failed to create secret key: %v", err)
	}

	// httptest.NewRequest (não http.NewRequest) com body nil: só o primeiro garante um
	// Request.Body não-nil (io.NoBody), como o servidor real sempre faz — createApprovalRequest
	// faz io.ReadAll(c.Request.Body) direto, sem checar nil (nunca precisou, porque toda rota
	// approval-aware existente já mandava corpo; esta é a primeira sem corpo).
	req := httptest.NewRequest(http.MethodDelete, "/secret-keys/key-1", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	if resp["action_type"] != string(entity.ApprovalActionSecretKeyDelete) {
		t.Errorf("expected action_type %q, got %v", entity.ApprovalActionSecretKeyDelete, resp["action_type"])
	}

	// A chave não deve ter sido apagada de fato.
	var stillThere entity.SecretKey
	if err := db.First(&stillThere, "id = ?", "key-1").Error; err != nil {
		t.Errorf("expected secret key to still exist, got error: %v", err)
	}
}

func TestApprovalWorkflow_SecretKeyCreate_NotMisclassifiedAsApplicationCreate(t *testing.T) {
	router, db, _ := setupApprovalWorkflowTestRouter(t)
	// Requer aprovação só para application_create — se generate-secret fosse mal classificado
	// como application_create (bug de ordering corrigido em getActionType), isto interceptaria por
	// engano. Só exigimos secret_key_create de verdade.
	enableApproval(t, db, entity.ApprovalConfig{SecretKeyCreate: true})

	req := httptest.NewRequest(http.MethodPost, "/applications/app-1/generate-secret", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	if resp["action_type"] != string(entity.ApprovalActionSecretKeyCreate) {
		t.Errorf("expected action_type %q, got %v (misclassified as application_create would leak here)", entity.ApprovalActionSecretKeyCreate, resp["action_type"])
	}
}

func TestApprovalWorkflow_ToggleEnableDisable_Intercepted(t *testing.T) {
	router, db, _ := setupApprovalWorkflowTestRouter(t)
	enableApproval(t, db, entity.ApprovalConfig{ToggleEnable: true, ToggleDisable: true})

	toggle := &entity.Toggle{ID: "toggle-1", AppID: "app-1", Value: "feature", Path: "feature", Enabled: true}
	if err := db.Create(toggle).Error; err != nil {
		t.Fatalf("failed to create toggle: %v", err)
	}
	// GORM pula colunas bool no valor zero (false) na criação quando a tag `gorm:"default:..."`
	// está presente (assume "não setado, use o default do banco") — força explicitamente via
	// UPDATE pra garantir o estado inicial real (false) que este teste precisa.
	if err := db.Model(&entity.Toggle{}).Where("id = ?", toggle.ID).Update("enabled", false).Error; err != nil {
		t.Fatalf("failed to force initial enabled=false: %v", err)
	}

	tests := []struct {
		name       string
		body       string
		wantAction entity.ApprovalActionType
	}{
		{"enable", `{"enabled": true}`, entity.ApprovalActionToggleEnable},
		{"disable", `{"enabled": false}`, entity.ApprovalActionToggleDisable},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req, _ := http.NewRequest(http.MethodPut, "/applications/app-1/toggle/toggle-1", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != http.StatusAccepted {
				t.Fatalf("expected 202, got %d: %s", w.Code, w.Body.String())
			}
			var resp map[string]interface{}
			if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
				t.Fatalf("invalid JSON response: %v", err)
			}
			if resp["action_type"] != string(tt.wantAction) {
				t.Errorf("expected action_type %q, got %v", tt.wantAction, resp["action_type"])
			}

			var stillUnchanged entity.Toggle
			if err := db.First(&stillUnchanged, "id = ?", "toggle-1").Error; err != nil {
				t.Fatalf("toggle disappeared: %v", err)
			}
			if stillUnchanged.Enabled != false {
				t.Errorf("expected toggle to remain unchanged (enabled=false) until approved, got enabled=%v", stillUnchanged.Enabled)
			}
		})
	}
}

// TestApprovalWorkflow_ToggleEnable_ApprovedAndExecuted_AppliesChange closes the loop past mere
// interception: approves the pending toggle_enable request as root and executes it, confirming
// ExecuteApprovedAction's pre-existing toggle_update dispatch (executeToggleUpdateAction) applies
// correctly against the actionData shape createApprovalRequest now builds for this new type.
func TestApprovalWorkflow_ToggleEnable_ApprovedAndExecuted_AppliesChange(t *testing.T) {
	router, db, _ := setupApprovalWorkflowTestRouter(t)
	root := enableApproval(t, db, entity.ApprovalConfig{ToggleEnable: true})

	toggle := &entity.Toggle{ID: "toggle-1", AppID: "app-1", Value: "feature", Path: "feature", Enabled: true}
	if err := db.Create(toggle).Error; err != nil {
		t.Fatalf("failed to create toggle: %v", err)
	}
	if err := db.Model(&entity.Toggle{}).Where("id = ?", toggle.ID).Update("enabled", false).Error; err != nil {
		t.Fatalf("failed to force initial enabled=false: %v", err)
	}

	req := httptest.NewRequest(http.MethodPut, "/applications/app-1/toggle/toggle-1", strings.NewReader(`{"enabled": true}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d: %s", w.Code, w.Body.String())
	}

	var pending entity.ApprovalRequest
	if err := db.Where("toggle_id = ? AND action_type = ?", "toggle-1", entity.ApprovalActionToggleEnable).First(&pending).Error; err != nil {
		t.Fatalf("expected a pending toggle_enable request, got: %v", err)
	}

	ctx := context.Background()
	if err := globalApprovalUseCase.ApproveRequest(ctx, pending.ID, root); err != nil {
		t.Fatalf("failed to approve request: %v", err)
	}
	if err := globalApprovalUseCase.ExecuteApprovedAction(ctx, pending.ID, root); err != nil {
		t.Fatalf("failed to execute approved action: %v", err)
	}

	var applied entity.Toggle
	if err := db.First(&applied, "id = ?", "toggle-1").Error; err != nil {
		t.Fatalf("toggle disappeared: %v", err)
	}
	if !applied.Enabled {
		t.Errorf("expected toggle to be enabled after approve+execute, still disabled")
	}
}

// v2.6 §6.5: seleção múltipla reusa os mesmos action types toggle_enable/toggle_disable do
// enable/disable recursivo singular (teste acima), mas via PUT .../toggles/bulk — sem
// :toggleId nenhum, só toggle_ids no corpo (ver middleware/approval.go, que deixa toggleID nil
// de propósito nesse caso pra ExecuteApprovedAction saber que é bulk).
func TestApprovalWorkflow_ToggleBulk_ApprovedAndExecuted_AppliesToEveryListedToggle(t *testing.T) {
	router, db, _ := setupApprovalWorkflowTestRouter(t)
	root := enableApproval(t, db, entity.ApprovalConfig{ToggleEnable: true})

	leaf1 := &entity.Toggle{ID: "leaf-1", AppID: "app-1", Value: "leaf1", Path: "a.leaf1", Enabled: true}
	leaf2 := &entity.Toggle{ID: "leaf-2", AppID: "app-1", Value: "leaf2", Path: "b.leaf2", Enabled: true}
	for _, tg := range []*entity.Toggle{leaf1, leaf2} {
		if err := db.Create(tg).Error; err != nil {
			t.Fatalf("failed to create toggle %s: %v", tg.ID, err)
		}
		if err := db.Model(&entity.Toggle{}).Where("id = ?", tg.ID).Update("enabled", false).Error; err != nil {
			t.Fatalf("failed to force initial enabled=false for %s: %v", tg.ID, err)
		}
	}

	req := httptest.NewRequest(http.MethodPut, "/applications/app-1/toggles/bulk", strings.NewReader(`{"toggle_ids":["leaf-1","leaf-2"],"enabled":true}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d: %s", w.Code, w.Body.String())
	}

	var pending entity.ApprovalRequest
	if err := db.Where("action_type = ?", entity.ApprovalActionToggleEnable).First(&pending).Error; err != nil {
		t.Fatalf("expected a pending toggle_enable request, got: %v", err)
	}
	if pending.ToggleID != nil {
		t.Errorf("expected a bulk request to have no single toggle_id, got %v", *pending.ToggleID)
	}
	if pending.Description != "Enable 2 toggles" {
		t.Errorf("expected description %q, got %q", "Enable 2 toggles", pending.Description)
	}

	ctx := context.Background()
	if err := globalApprovalUseCase.ApproveRequest(ctx, pending.ID, root); err != nil {
		t.Fatalf("failed to approve request: %v", err)
	}
	if err := globalApprovalUseCase.ExecuteApprovedAction(ctx, pending.ID, root); err != nil {
		t.Fatalf("failed to execute approved action: %v", err)
	}

	for _, id := range []string{"leaf-1", "leaf-2"} {
		var applied entity.Toggle
		if err := db.First(&applied, "id = ?", id).Error; err != nil {
			t.Fatalf("toggle %s disappeared: %v", id, err)
		}
		if !applied.Enabled {
			t.Errorf("expected toggle %s to be enabled after approve+execute, still disabled", id)
		}
	}
}

func TestApprovalWorkflow_ToggleRule_Intercepted(t *testing.T) {
	router, db, _ := setupApprovalWorkflowTestRouter(t)
	// Exige aprovação só para toggle_rule, não para toggle_update — se a heurística de
	// classificação não detectasse a regra de ativação no corpo, isto cairia em toggle_update e
	// aplicaria direto (falha silenciosa).
	enableApproval(t, db, entity.ApprovalConfig{ToggleRule: true})

	toggle := &entity.Toggle{ID: "toggle-1", AppID: "app-1", Value: "feature", Path: "feature", Enabled: true}
	if err := db.Create(toggle).Error; err != nil {
		t.Fatalf("failed to create toggle: %v", err)
	}

	body := `{"enabled": true, "has_activation_rule": true, "activation_rule": {"type": "percentage", "value": "50"}}`
	req, _ := http.NewRequest(http.MethodPut, "/applications/app-1/toggles/toggle-1", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	if resp["action_type"] != string(entity.ApprovalActionToggleRule) {
		t.Errorf("expected action_type %q, got %v", entity.ApprovalActionToggleRule, resp["action_type"])
	}

	var stillUnchanged entity.Toggle
	if err := db.First(&stillUnchanged, "id = ?", "toggle-1").Error; err != nil {
		t.Fatalf("toggle disappeared: %v", err)
	}
	if stillUnchanged.HasActivationRule {
		t.Errorf("expected activation rule NOT to be applied until approved")
	}
}

// TestApprovalWorkflow_ApplicationEdit_ApprovedAndExecuted_RenamesApplication closes the loop on
// a real bug found while writing the e2e journey for "edit application name with approval": PUT
// /applications/:id shares the application_create action_type with POST (no application_update
// constant exists — docs/rest-flow.md §9.1), and ExecuteApprovedAction's dispatch used to always
// treat it as a create, which failed every time (missing team_id) since an edit's body never has
// one. This proves the fix: approving an edit now actually renames the application instead of
// erroring out.
func TestApprovalWorkflow_ApplicationEdit_ApprovedAndExecuted_RenamesApplication(t *testing.T) {
	router, db, _ := setupApprovalWorkflowTestRouter(t)
	root := enableApproval(t, db, entity.ApprovalConfig{ApplicationCreate: true})

	req := httptest.NewRequest(http.MethodPut, "/applications/app-1", strings.NewReader(`{"name": "Renamed App"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d: %s", w.Code, w.Body.String())
	}

	var pending entity.ApprovalRequest
	if err := db.Where("application_id = ? AND action_type = ?", "app-1", entity.ApprovalActionApplicationCreate).First(&pending).Error; err != nil {
		t.Fatalf("expected a pending application_create (edit) request, got: %v", err)
	}

	ctx := context.Background()
	if err := globalApprovalUseCase.ApproveRequest(ctx, pending.ID, root); err != nil {
		t.Fatalf("failed to approve request: %v", err)
	}
	if err := globalApprovalUseCase.ExecuteApprovedAction(ctx, pending.ID, root); err != nil {
		t.Fatalf("failed to execute approved action: %v", err)
	}

	var applied entity.Application
	if err := db.First(&applied, "id = ?", "app-1").Error; err != nil {
		t.Fatalf("application disappeared: %v", err)
	}
	if applied.Name != "Renamed App" {
		t.Errorf("expected application to be renamed to 'Renamed App', got %q", applied.Name)
	}

	// A execução não deve ter criado uma segunda aplicação por engano (o bug original).
	var count int64
	db.Model(&entity.Application{}).Count(&count)
	if count != 1 {
		t.Errorf("expected exactly 1 application to exist, got %d", count)
	}
}

// TestApprovalWorkflow_ApplicationCreate_UsesRequestedTeam_NotFirstUserTeam reproduces a bug
// found investigating a live report: a Payment Squad approver never saw an application_create
// request filed by an admin who belongs to BOTH Payment Squad and Data Platform. determineTeamID
// (middleware/approval.go) had a case entity.ApprovalActionApplicationCreate,
// entity.ApprovalActionApplicationDelete: return getFirstUserTeam(...) — it ignored the team_id
// the client actually submitted in the POST body (required by
// application_handler.go#CreateApplicationRequest) and always filed the request under
// userTeams[0], whichever team GetTeamsByUserID happened to return first. An admin on two teams
// who explicitly picked team-2 in the create form got their request silently misfiled under
// team-1 — invisible to team-2's approvers, and visible only to team-1's (who never asked for
// it). This proves the fix: the request lands under the team_id actually submitted.
func TestApprovalWorkflow_ApplicationCreate_UsesRequestedTeam_NotFirstUserTeam(t *testing.T) {
	router, db, admin := setupApprovalWorkflowTestRouter(t)
	enableApproval(t, db, entity.ApprovalConfig{ApplicationCreate: true})

	// admin já pertence a team-1 (criado por setupApprovalWorkflowTestRouter); adiciona um
	// segundo team e o coloca lá também, ordenado para vir DEPOIS de team-1 em qualquer busca
	// naturalmente ordenada por criação/ID, reproduzindo o "primeiro team do usuário" != "team
	// escolhido no formulário".
	team2 := &entity.Team{ID: "team-2", Name: "Team 2"}
	if err := db.Create(team2).Error; err != nil {
		t.Fatalf("failed to create second team: %v", err)
	}
	if err := db.Create(&entity.TeamUser{TeamID: team2.ID, UserID: admin.ID}).Error; err != nil {
		t.Fatalf("failed to associate admin to second team: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/applications", strings.NewReader(`{"name": "New App", "team_id": "team-2"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d: %s", w.Code, w.Body.String())
	}

	var pending entity.ApprovalRequest
	if err := db.Where("action_type = ?", entity.ApprovalActionApplicationCreate).First(&pending).Error; err != nil {
		t.Fatalf("expected a pending application_create request, got: %v", err)
	}
	if pending.TeamID != "team-2" {
		t.Errorf("expected approval request to be filed under the requested team-2, got team_id=%q (misfiled under the admin's other team — invisible to the team-2 approver who should see it)", pending.TeamID)
	}
}

// TestApprovalWorkflow_SecretKeyCreate_RequesterGetsPlainKeyImmediately_ButItIsNotYetValid
// cobre o bug real reportado: gerar uma chave sob aprovação nunca devolvia a chave em texto puro
// a ninguém (executeSecretKeyCreateAction descartava o valor). Agora o valor é gerado e devolvido
// já na hora da solicitação (202), mas o registro nasce inativo — não deve autenticar nada antes
// da aprovação.
func TestApprovalWorkflow_SecretKeyCreate_RequesterGetsPlainKeyImmediately_ButItIsNotYetValid(t *testing.T) {
	router, db, _ := setupApprovalWorkflowTestRouter(t)
	enableApproval(t, db, entity.ApprovalConfig{SecretKeyCreate: true})

	req := httptest.NewRequest(http.MethodPost, "/applications/app-1/generate-secret", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	plainKey, _ := resp["plain_key"].(string)
	if plainKey == "" {
		t.Fatalf("expected plain_key in the 202 response — the requester has no other chance to ever see this key, got: %v", resp)
	}

	var pendingKey entity.SecretKey
	if err := db.Where("application_id = ?", "app-1").First(&pendingKey).Error; err != nil {
		t.Fatalf("expected a secret key row to already exist for app-1, got: %v", err)
	}
	if pendingKey.Active {
		t.Errorf("expected the pending key to be inactive until approved, got Active=true")
	}

	hash := sha256.Sum256([]byte(plainKey))
	if pendingKey.KeyHash != hex.EncodeToString(hash[:]) {
		t.Errorf("the plain_key returned does not match the hash of the pending row — requester was handed the wrong key")
	}
}

// TestApprovalWorkflow_SecretKeyCreate_ApprovedAndExecuted_ActivatesKeyAndRotatesOld verifica o
// ciclo completo: uma chave já ativa preexistente continua funcionando durante a espera, e só
// vira "previous" (v2.6 §5.1 — continua autenticando durante a janela de overlap, não é apagada)
// quando a nova é de fato aprovada+executada.
func TestApprovalWorkflow_SecretKeyCreate_ApprovedAndExecuted_ActivatesKeyAndRotatesOld(t *testing.T) {
	router, db, _ := setupApprovalWorkflowTestRouter(t)
	root := enableApproval(t, db, entity.ApprovalConfig{SecretKeyCreate: true})

	oldKey := &entity.SecretKey{ID: "old-key", Name: "API Access Key", ApplicationID: "app-1", CreatedBy: "admin-1", KeyHash: "old-hash", Active: true, IsCurrent: true}
	if err := db.Create(oldKey).Error; err != nil {
		t.Fatalf("failed to seed existing active key: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/applications/app-1/generate-secret", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d: %s", w.Code, w.Body.String())
	}

	var pendingRequest entity.ApprovalRequest
	if err := db.Where("application_id = ? AND action_type = ?", "app-1", entity.ApprovalActionSecretKeyCreate).First(&pendingRequest).Error; err != nil {
		t.Fatalf("expected a pending secret_key_create request, got: %v", err)
	}

	// A chave antiga continua lá enquanto a solicitação está pendente.
	if err := db.First(&entity.SecretKey{}, "id = ?", "old-key").Error; err != nil {
		t.Errorf("expected the old key to still exist while the new one is only pending, got: %v", err)
	}

	ctx := context.Background()
	if err := globalApprovalUseCase.ApproveRequest(ctx, pendingRequest.ID, root); err != nil {
		t.Fatalf("failed to approve request: %v", err)
	}
	if err := globalApprovalUseCase.ExecuteApprovedAction(ctx, pendingRequest.ID, root); err != nil {
		t.Fatalf("failed to execute approved action: %v", err)
	}

	var rotatedOldKey entity.SecretKey
	if err := db.First(&rotatedOldKey, "id = ?", "old-key").Error; err != nil {
		t.Fatalf("expected the old key to still exist (as previous, not deleted), got: %v", err)
	}
	if rotatedOldKey.IsCurrent {
		t.Error("expected the old key to no longer be current after rotation")
	}
	if rotatedOldKey.RevokedAt != nil {
		t.Error("expected the old key to still be valid (not revoked) during the overlap window")
	}

	var newKeys []entity.SecretKey
	if err := db.Where("application_id = ? AND revoked_at IS NULL", "app-1").Find(&newKeys).Error; err != nil {
		t.Fatalf("failed to query keys after execute: %v", err)
	}
	if len(newKeys) != 2 {
		t.Fatalf("expected exactly 2 live keys for app-1 after rotation (current + previous), got %d", len(newKeys))
	}
	var sawNewCurrent bool
	for _, k := range newKeys {
		if k.ID != "old-key" {
			sawNewCurrent = k.Active && k.IsCurrent
		}
	}
	if !sawNewCurrent {
		t.Error("expected the new key to be active and current after approve+execute")
	}
}

// TestApprovalWorkflow_SuggestToggleChange_AlwaysCreatesRequest_EvenWithoutApprovalConfigured
// cobre o núcleo do v2.6 §6.6: um membro do time SEM permissão de editar (role user) não pode
// aplicar a mudança direto, mas também não pode ficar travado só porque o admin nunca configurou
// toggle_enable/toggle_disable para exigir aprovação — CreateSuggestion ignora esse gate de
// propósito (diferente de toda outra rota approval-aware deste arquivo).
func TestApprovalWorkflow_SuggestToggleChange_AlwaysCreatesRequest_EvenWithoutApprovalConfigured(t *testing.T) {
	router, db, _ := setupApprovalWorkflowTestRouter(t)
	// Aprovação nem chega a estar habilitada — a suggestion precisa funcionar mesmo assim.

	plainUser := &entity.User{ID: "user-1", Username: "plainuser", Role: entity.UserRoleUser}
	if err := db.Create(plainUser).Error; err != nil {
		t.Fatalf("failed to create plain user: %v", err)
	}
	if err := db.Create(&entity.TeamUser{TeamID: "team-1", UserID: plainUser.ID}).Error; err != nil {
		t.Fatalf("failed to associate plain user to team-1: %v", err)
	}

	toggle := &entity.Toggle{ID: "toggle-1", AppID: "app-1", Value: "feature", Path: "feature", Enabled: true}
	if err := db.Create(toggle).Error; err != nil {
		t.Fatalf("failed to create toggle: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/applications/app-1/toggles/toggle-1/suggest", strings.NewReader(`{"enabled": false, "note": "seems stale"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Test-User", plainUser.ID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var pending entity.ApprovalRequest
	if err := db.Where("toggle_id = ? AND action_type = ?", "toggle-1", entity.ApprovalActionToggleDisable).First(&pending).Error; err != nil {
		t.Fatalf("expected a pending toggle_disable request, got: %v", err)
	}
	if pending.RequestedBy != plainUser.ID {
		t.Errorf("expected requested_by=%q, got %q", plainUser.ID, pending.RequestedBy)
	}
	if pending.TeamID != "team-1" {
		t.Errorf("expected team_id=%q, got %q", "team-1", pending.TeamID)
	}
	if !strings.Contains(pending.Description, "seems stale") {
		t.Errorf("expected the note to be reflected in the description, got %q", pending.Description)
	}

	// A suggestion nunca aplica a mudança direto, independente de required_actions.
	var untouched entity.Toggle
	if err := db.First(&untouched, "id = ?", "toggle-1").Error; err != nil {
		t.Fatalf("toggle disappeared: %v", err)
	}
	if !untouched.Enabled {
		t.Errorf("expected the toggle to remain unchanged (enabled=true) until approved, got enabled=%v", untouched.Enabled)
	}
}

// TestApprovalWorkflow_SuggestToggleChange_NonTeamMember_Denied confirma que o gate de
// pertencimento ao team (o mesmo access.CanRead usado por toda solicitação de aprovação) também
// vale aqui — uma sugestão não é uma brecha pra propor mudanças em qualquer aplicação do sistema.
func TestApprovalWorkflow_SuggestToggleChange_NonTeamMember_Denied(t *testing.T) {
	router, db, _ := setupApprovalWorkflowTestRouter(t)

	outsider := &entity.User{ID: "outsider-1", Username: "outsider", Role: entity.UserRoleUser}
	if err := db.Create(outsider).Error; err != nil {
		t.Fatalf("failed to create outsider: %v", err)
	}

	toggle := &entity.Toggle{ID: "toggle-1", AppID: "app-1", Value: "feature", Path: "feature", Enabled: true}
	if err := db.Create(toggle).Error; err != nil {
		t.Fatalf("failed to create toggle: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/applications/app-1/toggles/toggle-1/suggest", strings.NewReader(`{"enabled": false}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Test-User", outsider.ID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", w.Code, w.Body.String())
	}
}

// TestApprovalWorkflow_SecretKeyCreate_Rejected_DeletesPendingKeyPhysically confirma o outro lado
// da decisão: rejeitar a solicitação apaga fisicamente o registro pendente (nunca chegou a ser
// válido, não há razão pra manter o hash), sem afetar uma chave ativa preexistente.
func TestApprovalWorkflow_SecretKeyCreate_Rejected_DeletesPendingKeyPhysically(t *testing.T) {
	router, db, _ := setupApprovalWorkflowTestRouter(t)
	root := enableApproval(t, db, entity.ApprovalConfig{SecretKeyCreate: true})

	oldKey := &entity.SecretKey{ID: "old-key", Name: "API Access Key", ApplicationID: "app-1", CreatedBy: "admin-1", KeyHash: "old-hash", Active: true}
	if err := db.Create(oldKey).Error; err != nil {
		t.Fatalf("failed to seed existing active key: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/applications/app-1/generate-secret", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d: %s", w.Code, w.Body.String())
	}

	var pendingRequest entity.ApprovalRequest
	if err := db.Where("application_id = ? AND action_type = ?", "app-1", entity.ApprovalActionSecretKeyCreate).First(&pendingRequest).Error; err != nil {
		t.Fatalf("expected a pending secret_key_create request, got: %v", err)
	}
	var pendingKeyID string
	{
		var actionData struct {
			SecretKeyID string `json:"secret_key_id"`
		}
		if err := pendingRequest.GetActionDataAs(&actionData); err != nil {
			t.Fatalf("failed to read action_data: %v", err)
		}
		pendingKeyID = actionData.SecretKeyID
	}
	if pendingKeyID == "" {
		t.Fatalf("expected action_data to carry the pending secret_key_id")
	}

	ctx := context.Background()
	if err := globalApprovalUseCase.RejectRequest(ctx, pendingRequest.ID, root, "not needed"); err != nil {
		t.Fatalf("failed to reject request: %v", err)
	}

	if err := db.First(&entity.SecretKey{}, "id = ?", pendingKeyID).Error; err == nil {
		t.Errorf("expected the pending secret key row to be physically deleted after rejection")
	}

	// A chave antiga, ativa, não deve ter sido tocada pela rejeição.
	var stillActive entity.SecretKey
	if err := db.First(&stillActive, "id = ?", "old-key").Error; err != nil {
		t.Fatalf("expected old active key to still exist after rejecting the new one, got: %v", err)
	}
	if !stillActive.Active {
		t.Errorf("expected old key to remain active, got Active=false")
	}
}
