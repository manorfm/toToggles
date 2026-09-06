package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// setupAuditIntegrationTestRouter espelha setupApprovalWorkflowTestRouter (mesmo schema patch
// pra team_users/team_applications), mas com DOIS times/usuários — usado pra provar de ponta a
// ponta (banco real, handlers reais, sem mock) que eventos gravados por mutações reais têm o
// texto/target/application_id corretos, e que GET /audit é root-only (v2.6 §7) enquanto
// GET /applications/:id/audit (Activity) continua aberto a qualquer autenticado.
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

	teamAdmin = &entity.User{ID: "admin-1", Name: "Admin One", Username: "admin1", Role: entity.UserRoleAdmin}
	otherTeamAdmin = &entity.User{ID: "admin-2", Name: "Admin Two", Username: "admin2", Role: entity.UserRoleAdmin}
	// InitHandlers já seguiu seu próprio fluxo e criou um usuário "root" (InitializeRootUser) —
	// username diferente aqui só pra não colidir com esse, este é só mais um usuário de teste.
	root = &entity.User{ID: "root-1", Name: "Root Test", Username: "root-test", Role: entity.UserRoleRoot}
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
	router.DELETE("/applications/:id", RequireApprovalAware(entity.UserRoleRoot), DeleteApplication)
	router.POST("/applications/:id/toggles", RequireApprovalAware(entity.UserRoleAdmin), CreateToggle)
	router.PUT("/applications/:id/toggles/:toggleId", RequireApprovalAware(entity.UserRoleAdmin), UpdateToggle)
	router.DELETE("/applications/:id/toggles/:toggleId", RequireApprovalAware(entity.UserRoleAdmin), DeleteToggle)
	router.PUT("/applications/:id/toggle/:toggleId", RequireApprovalAware(entity.UserRoleAdmin), UpdateEnabled)
	router.POST("/applications/:id/generate-secret", RequireApprovalAware(entity.UserRoleAdmin), GenerateSecretKey)
	router.DELETE("/secret-keys/:id", RequireApprovalAware(entity.UserRoleAdmin), DeleteSecretKey)
	router.POST("/teams/:id/users", AddUserToTeam)
	router.POST("/users", CreateUser)
	router.PUT("/applications/:id", RequireApprovalAware(entity.UserRoleAdmin), UpdateApplication)
	// Root-only, mesmo grupo de rota de routes.go — a antiga visibilidade por time
	// (domain/policy.AuditAccess) foi removida quando o usuário pediu pra restringir History a
	// root (v2.6 §7): admin/user não veem mais o audit trail geral, só a Activity de cada
	// aplicação (GetApplicationAudit, sem RequireRoot, abaixo).
	router.GET("/audit", RequireRoot(), GetAuditLog)
	router.GET("/audit/actors", RequireRoot(), GetAuditActors)
	router.GET("/applications/:id/audit", GetApplicationAudit)

	return router, db, teamAdmin, otherTeamAdmin, root
}

// auditReaderID lê GET /audit como root — root-only desde v2.6 §7 (ver setupAuditIntegrationTestRouter),
// e o valor em si é o mesmo `root.ID` fixo ("root-1") que ela sempre cria. Usado pelos helpers
// abaixo, que testam o CONTEÚDO gravado por uma mutação (texto/target/etc.), não visibilidade —
// quem lê não afeta o que uma mutação gravou.
const auditReaderID = "root-1"

// latestAuditText devolve o `text` do evento mais recente de um dado event_type — usado pelos
// testes de texto abaixo, que checam o CONTEÚDO exato da mensagem (não só que um evento existe),
// conferido contra os `logAudit(...)` reais do protótipo.
func latestAuditText(t *testing.T, router *gin.Engine, eventType string) string {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/audit", nil)
	req.Header.Set("X-Test-User", auditReaderID)
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

// latestAuditTextAndTarget é como latestAuditText, mas também devolve `target` — usado pelos
// testes que travam as DUAS linhas do item (texto+alvo), não só o texto. O item real do
// protótipo (AUDIT_SEED/HistoryView) sempre mostra as 3 linhas — texto/target/meta — quando
// target não é vazio; um target ausente faz o item colapsar pra 2 linhas visíveis.
func latestAuditTextAndTarget(t *testing.T, router *gin.Engine, eventType string) (text, target string) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/audit", nil)
	req.Header.Set("X-Test-User", auditReaderID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 from GET /audit, got %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Data []struct {
			EventType string `json:"event_type"`
			Text      string `json:"text"`
			Target    string `json:"target"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	for _, e := range resp.Data {
		if e.EventType == eventType {
			return e.Text, e.Target
		}
	}
	t.Fatalf("no %q event found in %+v", eventType, resp.Data)
	return "", ""
}

// v2.6 §7: History (GET /audit) virou root-only a pedido do usuário, depois que admin/user viam
// o audit trail geral quando deveriam ver só a Activity tab da própria aplicação. Substituiu o
// teste antigo desta função (TestAuditIntegration_ApplicationCreate_VisibleOnlyToTeamAndRoot),
// que provava visibilidade por time — comportamento removido, não mais aplicável.
func TestAuditIntegration_GetAuditLog_RootOnly(t *testing.T) {
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

	t.Run("refused to a non-root member of the team that owns the event", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/audit", nil)
		req.Header.Set("X-Test-User", teamAdmin.ID)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code != http.StatusForbidden {
			t.Errorf("expected 403 for a non-root caller, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("refused to a non-root admin of an unrelated team", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/audit", nil)
		req.Header.Set("X-Test-User", otherTeamAdmin.ID)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code != http.StatusForbidden {
			t.Errorf("expected 403 for a non-root caller, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("root sees the event, even though it belongs to a team root isn't a member of", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/audit", nil)
		req.Header.Set("X-Test-User", root.ID)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 from GET /audit, got %d: %s", w.Code, w.Body.String())
		}
		var resp struct {
			Data []struct {
				EventType string `json:"event_type"`
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
		if !found {
			t.Errorf("expected root to see application_created, got %+v", resp.Data)
		}
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

	got := latestAuditText(t, router, "toggle_rule_set")
	want := "Set <b>percentage</b> rule to <b>40%</b>"
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
	if got := latestAuditText(t, router, "key_generated"); got != "Generated service key" {
		t.Errorf("expected the first generation to say 'Generated service key', got %q", got)
	}

	generate()
	if got := latestAuditText(t, router, "key_generated"); got != "Rotated service key" {
		t.Errorf("expected the second generation (a key already existed) to say 'Rotated service key', got %q", got)
	}
}

// Confirmado no protótipo real: `Added <b>{name}</b>`, target `{team} team` — bolda o nome
// completo do membro adicionado (não @username), com o time no target.
func TestAuditIntegration_MemberAdded_TextIncludesTheAddedUsersFullName(t *testing.T) {
	router, db, teamAdmin, _, _ := setupAuditIntegrationTestRouter(t)

	newMember := &entity.User{ID: "user-new", Name: "Bea Costa", Username: "bea"}
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

	got := latestAuditText(t, router, "member_added")
	want := "Added <b>Bea Costa</b>"
	if got != want {
		t.Errorf("expected audit text %q, got %q", want, got)
	}
}

// Confirmado no protótipo real (app.jsx#doCreateUser): logAudit("member", "Criou usuário
// <name> (@<username>)", ...) — o texto usa o NOME COMPLETO de quem foi criado, não só o
// username, e o actor gravado é o nome completo de quem criou (currentUser.name), não seu
// username. Trava os dois pontos junto — o gap real era entity.User não ter um campo Name
// nenhum, então tanto o texto quanto o actor caíam de volta pro username.
func TestAuditIntegration_UserCreate_TextUsesFullNameAndActorIsDisplayName(t *testing.T) {
	router, db, teamAdmin, _, _ := setupAuditIntegrationTestRouter(t)
	// CreateUser confere IsMemberOfTeam em memória (não reconsulta o banco) — a associação já
	// existe na tabela team_users (setupAuditIntegrationTestRouter), mas o struct em memória
	// também precisa refletir isso, mesmo padrão já usado em user_management_handler_test.go.
	teamAdmin.Teams = []*entity.Team{{ID: "team-1"}}

	body, _ := json.Marshal(map[string]any{
		"name":     "Bea Ribeiro",
		"username": "bea.ribeiro",
		"role":     "user",
		"team_id":  "team-1",
	})
	req := httptest.NewRequest(http.MethodPost, "/users", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Test-User", teamAdmin.ID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 creating the user, got %d: %s", w.Code, w.Body.String())
	}

	var created entity.User
	if err := db.Where("username = ?", "bea.ribeiro").First(&created).Error; err != nil {
		t.Fatalf("created user not found: %v", err)
	}
	if created.Name != "Bea Ribeiro" {
		t.Fatalf("expected the created user's Name to be persisted, got %q", created.Name)
	}

	auditReq := httptest.NewRequest(http.MethodGet, "/audit", nil)
	auditReq.Header.Set("X-Test-User", auditReaderID)
	auditW := httptest.NewRecorder()
	router.ServeHTTP(auditW, auditReq)
	if auditW.Code != http.StatusOK {
		t.Fatalf("expected 200 from GET /audit, got %d: %s", auditW.Code, auditW.Body.String())
	}
	var resp struct {
		Data []struct {
			EventType string `json:"event_type"`
			Text      string `json:"text"`
			Target    string `json:"target"`
			ActorName string `json:"actor_name"`
		} `json:"data"`
	}
	if err := json.Unmarshal(auditW.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	for _, e := range resp.Data {
		if e.EventType != "user_created" {
			continue
		}
		if want := "Created user <b>Bea Ribeiro</b> (@bea.ribeiro)"; e.Text != want {
			t.Errorf("expected audit text %q, got %q", want, e.Text)
		}
		// target confirmado no protótipo real (app.jsx#doCreateUser): `${data.team} team` — sem
		// isso o item cai de 3 linhas (texto/target/meta) pra 2 (texto/meta).
		if want := "Team 1 team"; e.Target != want {
			t.Errorf("expected target %q, got %q", want, e.Target)
		}
		if e.ActorName != "Admin One" {
			t.Errorf("expected actor_name to be the creator's full display name %q, got %q", "Admin One", e.ActorName)
		}
		return
	}
	t.Fatalf("no user_created event found in %+v", resp.Data)
}

// Os testes abaixo travam o achado de um segundo screenshot real do protótipo: cada item do
// History mostra 3 linhas (texto/target/meta) — a reescrita estava gravando `target` vazio pra
// vários eventos, colapsando pra 2 linhas visíveis. Cada caso confirma text+target juntos contra
// o AUDIT_SEED/logAudit real.

func TestAuditIntegration_ToggleCreate_TargetIsApplicationName(t *testing.T) {
	router, db, teamAdmin, _, _ := setupAuditIntegrationTestRouter(t)

	// CreateToggle (diferente de UpdateToggle/DeleteToggle) valida o formato do ID via
	// entity.ValidateApplicationID — precisa de um ULID de 26 caracteres de verdade, "app-1" é
	// rejeitado com 400 antes mesmo de chegar no usecase.
	appID := "01JZNM42NKSANGHZ3G4KKXGCNW"
	app := &entity.Application{ID: appID, Name: "Checkout Web"}
	if err := db.Create(app).Error; err != nil {
		t.Fatalf("failed to create application: %v", err)
	}
	if err := db.Create(&entity.TeamApplication{TeamID: "team-1", ApplicationID: app.ID, Permission: entity.PermissionAdmin}).Error; err != nil {
		t.Fatalf("failed to associate application to team: %v", err)
	}

	body := `{"toggle": "payments.card.rollout"}`
	req := httptest.NewRequest(http.MethodPost, "/applications/"+appID+"/toggles", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Test-User", teamAdmin.ID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 creating the toggle, got %d: %s", w.Code, w.Body.String())
	}

	text, target := latestAuditTextAndTarget(t, router, "toggle_created")
	if want := "Created toggle <b>payments.card.rollout</b>"; text != want {
		t.Errorf("expected text %q, got %q", want, text)
	}
	if want := "Checkout Web"; target != want {
		t.Errorf("expected target (application name, not the toggle path again) %q, got %q", want, target)
	}
}

// Confirmado no protótipo real (app.jsx#handleToggle): bolda só o ÚLTIMO segmento do path, não o
// path inteiro; target combina nome da aplicação + path completo com " · ".
func TestAuditIntegration_ToggleDisableRecursive_TextBoldsLastSegmentAndTargetCombinesAppAndPath(t *testing.T) {
	router, db, teamAdmin, _, _ := setupAuditIntegrationTestRouter(t)

	app := &entity.Application{ID: "app-1", Name: "Checkout Web"}
	if err := db.Create(app).Error; err != nil {
		t.Fatalf("failed to create application: %v", err)
	}
	if err := db.Create(&entity.TeamApplication{TeamID: "team-1", ApplicationID: app.ID, Permission: entity.PermissionAdmin}).Error; err != nil {
		t.Fatalf("failed to associate application to team: %v", err)
	}
	toggle := &entity.Toggle{ID: "toggle-1", AppID: app.ID, Value: "experiments", Path: "checkout.experiments", Enabled: true}
	if err := db.Create(toggle).Error; err != nil {
		t.Fatalf("failed to create toggle: %v", err)
	}

	body := `{"enabled": false}`
	req := httptest.NewRequest(http.MethodPut, "/applications/app-1/toggle/toggle-1", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Test-User", teamAdmin.ID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 disabling the toggle, got %d: %s", w.Code, w.Body.String())
	}

	text, target := latestAuditTextAndTarget(t, router, "toggle_disabled")
	if want := "Disabled <b>experiments</b>"; text != want {
		t.Errorf("expected text (bolds only the last path segment) %q, got %q", want, text)
	}
	if want := "Checkout Web · checkout.experiments"; target != want {
		t.Errorf("expected target (app name + full path) %q, got %q", want, target)
	}
}

// Confirmado no protótipo real (app.jsx#saveDrawer): o switch de Status do drawer não é
// desabilitado quando um ancestral está off (diferente do switch do ToggleCard, que É
// desabilitado nesse caso — por isso só o drawer alcança este caminho). Ligar um toggle cujo
// ancestral segue desligado é permitido, mas o evento de auditoria ganha um sufixo avisando que
// não teve efeito nenhum — v2.6 §3.3.
func TestAuditIntegration_ToggleEnable_NoEffectSuffixWhenAnAncestorIsOff(t *testing.T) {
	router, db, teamAdmin, _, _ := setupAuditIntegrationTestRouter(t)

	app := &entity.Application{ID: "app-1", Name: "Checkout Web"}
	if err := db.Create(app).Error; err != nil {
		t.Fatalf("failed to create application: %v", err)
	}
	if err := db.Create(&entity.TeamApplication{TeamID: "team-1", ApplicationID: app.ID, Permission: entity.PermissionAdmin}).Error; err != nil {
		t.Fatalf("failed to associate application to team: %v", err)
	}
	// Enabled: false na struct de criação não basta — GORM só grava um valor "diferente do zero
	// value do tipo" na hora do INSERT quando decidindo aplicar um `gorm:"default:..."` da
	// coluna (aqui, `default:true`); como o zero value de bool É false, um Create com
	// Enabled:false é indistinguível de "não setado" e o banco aplica o default (true) mesmo
	// assim. Update explícito depois do Create contorna isso (não é mais um INSERT).
	parent := &entity.Toggle{ID: "parent-1", AppID: app.ID, Value: "payments", Path: "payments", Enabled: true}
	if err := db.Create(parent).Error; err != nil {
		t.Fatalf("failed to create parent toggle: %v", err)
	}
	if err := db.Model(parent).Update("enabled", false).Error; err != nil {
		t.Fatalf("failed to disable parent toggle: %v", err)
	}
	child := &entity.Toggle{ID: "child-1", AppID: app.ID, ParentID: &parent.ID, Value: "card", Path: "payments.card", Enabled: false}
	if err := db.Create(child).Error; err != nil {
		t.Fatalf("failed to create child toggle: %v", err)
	}

	body := `{"enabled": true}`
	req := httptest.NewRequest(http.MethodPut, "/applications/app-1/toggles/child-1", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Test-User", teamAdmin.ID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 enabling the toggle, got %d: %s", w.Code, w.Body.String())
	}

	text := latestAuditText(t, router, "toggle_enabled")
	if want := "Enabled <b>card</b> <i>(no effect — payments is off)</i>"; text != want {
		t.Errorf("expected text with no-effect suffix naming the blocking ancestor %q, got %q", want, text)
	}
}

// Contraprova do teste acima: sem ancestral desligado, nenhum sufixo é adicionado.
func TestAuditIntegration_ToggleEnable_NoSuffixWhenNoAncestorIsOff(t *testing.T) {
	router, db, teamAdmin, _, _ := setupAuditIntegrationTestRouter(t)

	app := &entity.Application{ID: "app-1", Name: "Checkout Web"}
	if err := db.Create(app).Error; err != nil {
		t.Fatalf("failed to create application: %v", err)
	}
	if err := db.Create(&entity.TeamApplication{TeamID: "team-1", ApplicationID: app.ID, Permission: entity.PermissionAdmin}).Error; err != nil {
		t.Fatalf("failed to associate application to team: %v", err)
	}
	parent := &entity.Toggle{ID: "parent-1", AppID: app.ID, Value: "payments", Path: "payments", Enabled: true}
	if err := db.Create(parent).Error; err != nil {
		t.Fatalf("failed to create parent toggle: %v", err)
	}
	child := &entity.Toggle{ID: "child-1", AppID: app.ID, ParentID: &parent.ID, Value: "card", Path: "payments.card", Enabled: false}
	if err := db.Create(child).Error; err != nil {
		t.Fatalf("failed to create child toggle: %v", err)
	}

	body := `{"enabled": true}`
	req := httptest.NewRequest(http.MethodPut, "/applications/app-1/toggles/child-1", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Test-User", teamAdmin.ID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 enabling the toggle, got %d: %s", w.Code, w.Body.String())
	}

	text := latestAuditText(t, router, "toggle_enabled")
	if want := "Enabled <b>card</b>"; text != want {
		t.Errorf("expected plain text with no suffix %q, got %q", want, text)
	}
}

// Confirmado no protótipo real (app.jsx#doDeleteToggle): bolda só o ÚLTIMO segmento
// (`label.split(".").pop()`), target é o nome da aplicação.
func TestAuditIntegration_ToggleDelete_TextBoldsLastSegmentAndTargetIsApplicationName(t *testing.T) {
	router, db, teamAdmin, _, _ := setupAuditIntegrationTestRouter(t)

	app := &entity.Application{ID: "app-1", Name: "Mobile App"}
	if err := db.Create(app).Error; err != nil {
		t.Fatalf("failed to create application: %v", err)
	}
	if err := db.Create(&entity.TeamApplication{TeamID: "team-1", ApplicationID: app.ID, Permission: entity.PermissionAdmin}).Error; err != nil {
		t.Fatalf("failed to associate application to team: %v", err)
	}
	toggle := &entity.Toggle{ID: "toggle-1", AppID: app.ID, Value: "legacy-feed", Path: "profile.legacy-feed", Enabled: true}
	if err := db.Create(toggle).Error; err != nil {
		t.Fatalf("failed to create toggle: %v", err)
	}

	req := httptest.NewRequest(http.MethodDelete, "/applications/app-1/toggles/toggle-1", nil)
	req.Header.Set("X-Test-User", teamAdmin.ID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 deleting the toggle, got %d: %s", w.Code, w.Body.String())
	}

	text, target := latestAuditTextAndTarget(t, router, "toggle_deleted")
	if want := "Deleted toggle <b>legacy-feed</b>"; text != want {
		t.Errorf("expected text (bolds only the last path segment) %q, got %q", want, text)
	}
	if want := "Mobile App"; target != want {
		t.Errorf("expected target (application name) %q, got %q", want, target)
	}
}

// Confirmado no protótipo real (AUDIT_SEED au4): target é o nome da aplicação.
func TestAuditIntegration_KeyGenerate_TargetIsApplicationName(t *testing.T) {
	router, db, teamAdmin, _, _ := setupAuditIntegrationTestRouter(t)

	app := &entity.Application{ID: "app-1", Name: "Checkout Web"}
	if err := db.Create(app).Error; err != nil {
		t.Fatalf("failed to create application: %v", err)
	}
	if err := db.Create(&entity.TeamApplication{TeamID: "team-1", ApplicationID: app.ID, Permission: entity.PermissionAdmin}).Error; err != nil {
		t.Fatalf("failed to associate application to team: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/applications/app-1/generate-secret", nil)
	req.Header.Set("X-Test-User", teamAdmin.ID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 generating the key, got %d: %s", w.Code, w.Body.String())
	}

	_, target := latestAuditTextAndTarget(t, router, "key_generated")
	if want := "Checkout Web"; target != want {
		t.Errorf("expected target (application name) %q, got %q", want, target)
	}
}

// Confirmado no protótipo real (app.jsx#doCreateApp): target `${data.team} team`.
func TestAuditIntegration_ApplicationCreate_TargetIsTeamName(t *testing.T) {
	router, _, teamAdmin, _, _ := setupAuditIntegrationTestRouter(t)

	body, _ := json.Marshal(map[string]string{"name": "Checkout Web", "team_id": "team-1"})
	req := httptest.NewRequest(http.MethodPost, "/applications", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Test-User", teamAdmin.ID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 creating the application, got %d: %s", w.Code, w.Body.String())
	}

	_, target := latestAuditTextAndTarget(t, router, "application_created")
	if want := "Team 1 team"; target != want {
		t.Errorf("expected target %q, got %q", want, target)
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

	requestedText, requestedTarget := latestAuditTextAndTarget(t, router, "approval_requested")
	if want := "Requested: <b>Create toggle</b>"; requestedText != want {
		t.Errorf("expected the approval_requested text to be the short action name (path moved to target), got %q, want %q", requestedText, want)
	}
	if want := "payments.new-feature"; requestedTarget != want {
		t.Errorf("expected the approval_requested target to be the toggle path, got %q", requestedTarget)
	}

	// v2.6 §7 — bug real reportado em uso ao vivo: "deveria ter o pedido, a aprovação e a criação,
	// só tem a criação listada". request.ApplicationID já é conhecido neste caso (a aplicação já
	// existe — só uma criação de aplicação em si não teria isso) — approval_requested/approved
	// devem carregar application_id igual ao evento de execução, pra a Activity mostrar a jornada
	// completa (pedido → aprovação → execução), não só o passo final.
	var requestedEntry entity.AuditLog
	if err := db.Where("event_type = ?", "approval_requested").First(&requestedEntry).Error; err != nil {
		t.Fatalf("expected an approval_requested audit entry: %v", err)
	}
	if requestedEntry.ApplicationID == nil || *requestedEntry.ApplicationID != "app-1" {
		t.Errorf("expected the approval_requested event to carry application_id=%q, got %+v", "app-1", requestedEntry.ApplicationID)
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

	createdText, createdTarget := latestAuditTextAndTarget(t, router, "toggle_created")
	if want := "Created toggle <b>payments.new-feature</b> (after approval)"; createdText != want {
		t.Errorf("expected the execution event's text to be bolded and end with '(after approval)', got %q, want %q", createdText, want)
	}
	if want := "Checkout Web"; createdTarget != want {
		t.Errorf("expected the execution event's target (application name, not path) to be %q, got %q", want, createdTarget)
	}

	// v2.6 §7 — bug real reportado em uso ao vivo: o evento de domínio final de uma ação aprovada
	// nunca carregava application_id (só o caminho de execução DIRETA, sem aprovação, tinha sido
	// migrado) — a Activity tab de uma aplicação ficava sempre vazia pra times com o workflow de
	// aprovação ligado, mesmo com atividade de verdade acontecendo.
	var createdEntry entity.AuditLog
	if err := db.Where("event_type = ?", "toggle_created").First(&createdEntry).Error; err != nil {
		t.Fatalf("expected a toggle_created audit entry: %v", err)
	}
	if createdEntry.ApplicationID == nil || *createdEntry.ApplicationID != "app-1" {
		t.Errorf("expected the execution event to carry application_id=%q, got %+v", "app-1", createdEntry.ApplicationID)
	}

	approvedText, approvedTarget := latestAuditTextAndTarget(t, router, "approval_approved")
	if want := "Approved <b>Create toggle</b> request"; approvedText != want {
		t.Errorf("expected the approval_approved text to match AUDIT_SEED's real pattern (no colon, ' request' suffix), got %q, want %q", approvedText, want)
	}
	if want := "payments.new-feature"; approvedTarget != want {
		t.Errorf("expected the approval_approved target to be the toggle path, got %q", approvedTarget)
	}

	var approvedEntry entity.AuditLog
	if err := db.Where("event_type = ?", "approval_approved").First(&approvedEntry).Error; err != nil {
		t.Fatalf("expected an approval_approved audit entry: %v", err)
	}
	if approvedEntry.ApplicationID == nil || *approvedEntry.ApplicationID != "app-1" {
		t.Errorf("expected the approval_approved event to carry application_id=%q, got %+v", "app-1", approvedEntry.ApplicationID)
	}

	// A jornada completa (requested → approved → toggle_created) precisa aparecer na Activity tab
	// da própria aplicação — não só o passo final.
	activityReq := httptest.NewRequest(http.MethodGet, "/applications/app-1/audit", nil)
	activityReq.Header.Set("X-Test-User", teamAdmin.ID)
	activityW := httptest.NewRecorder()
	router.ServeHTTP(activityW, activityReq)
	if activityW.Code != http.StatusOK {
		t.Fatalf("expected 200 from GET .../audit, got %d: %s", activityW.Code, activityW.Body.String())
	}
	var activityResp struct {
		Data []struct {
			EventType string `json:"event_type"`
		} `json:"data"`
	}
	if err := json.Unmarshal(activityW.Body.Bytes(), &activityResp); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	seen := map[string]bool{}
	for _, e := range activityResp.Data {
		seen[e.EventType] = true
	}
	for _, want := range []string{"approval_requested", "approval_approved", "toggle_created"} {
		if !seen[want] {
			t.Errorf("expected the application's Activity feed to include %q, got %+v", want, activityResp.Data)
		}
	}
}

// Antes desta correção, resolveApprovalExecutionAudit (então auditEventForApprovalExecution)
// reaproveitava request.Description sem negrito e sem target nenhum — o gap real por trás do
// History mostrar 2 linhas em vez de 3 pra qualquer ação executada via aprovação. Prova que
// target/negrito de toggle_deleted via aprovação são resolvidos ANTES da exclusão (o toggle não
// existe mais depois) e seguem o protótipo real (app.jsx#executePendingAction): target = só o
// nome da aplicação, não "{app} · {path}" como a exclusão direta.
func TestAuditIntegration_ApprovalFlow_ToggleDelete_TextBoldedTargetIsAppNameOnly(t *testing.T) {
	router, db, teamAdmin, _, root := setupAuditIntegrationTestRouter(t)

	app := &entity.Application{ID: "app-1", Name: "Checkout Web"}
	if err := db.Create(app).Error; err != nil {
		t.Fatalf("failed to create application: %v", err)
	}
	if err := db.Create(&entity.TeamApplication{TeamID: "team-1", ApplicationID: app.ID, Permission: entity.PermissionAdmin}).Error; err != nil {
		t.Fatalf("failed to associate application to team: %v", err)
	}
	toggle := &entity.Toggle{ID: "toggle-1", AppID: app.ID, Value: "legacy-feed", Path: "profile.legacy-feed", Enabled: true}
	if err := db.Create(toggle).Error; err != nil {
		t.Fatalf("failed to create toggle: %v", err)
	}

	enabled := true
	if _, err := globalApprovalUseCase.UpdateApprovalSettings(context.Background(), root.ID, &entity.UpdateApprovalSettingsRequest{
		ApprovalEnabled: &enabled,
		RequiredActions: &entity.ApprovalConfig{ToggleDelete: true},
	}); err != nil {
		t.Fatalf("failed to enable approval settings: %v", err)
	}

	req := httptest.NewRequest(http.MethodDelete, "/applications/app-1/toggles/toggle-1", nil)
	req.Header.Set("X-Test-User", teamAdmin.ID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusAccepted {
		t.Fatalf("expected 202 (intercepted by the approval workflow), got %d: %s", w.Code, w.Body.String())
	}

	var pending entity.ApprovalRequest
	if err := db.Where("action_type = ?", entity.ApprovalActionToggleDelete).First(&pending).Error; err != nil {
		t.Fatalf("expected a pending toggle_delete request, got: %v", err)
	}

	ctx := context.Background()
	if err := globalApprovalUseCase.ApproveRequest(ctx, pending.ID, root); err != nil {
		t.Fatalf("failed to approve request: %v", err)
	}
	if err := globalApprovalUseCase.ExecuteApprovedAction(ctx, pending.ID, root); err != nil {
		t.Fatalf("failed to execute approved action: %v", err)
	}

	deletedText, deletedTarget := latestAuditTextAndTarget(t, router, "toggle_deleted")
	if want := "Deleted toggle <b>profile.legacy-feed</b> (after approval)"; deletedText != want {
		t.Errorf("expected text %q, got %q", want, deletedText)
	}
	if want := "Checkout Web"; deletedTarget != want {
		t.Errorf("expected target (application name, resolved before deletion) %q, got %q", want, deletedTarget)
	}
}

// Confirmado no protótipo real: o pendingAction de deleteApp não passa target nenhum pro
// logAudit — diferente de toda outra ação executada via aprovação, esta deve continuar
// renderizando 2 linhas (sem .audit-target), não um gap a corrigir.
func TestAuditIntegration_ApprovalFlow_ApplicationDelete_TargetIsEmptyByDesign(t *testing.T) {
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
		RequiredActions: &entity.ApprovalConfig{ApplicationDelete: true},
	}); err != nil {
		t.Fatalf("failed to enable approval settings: %v", err)
	}

	req := httptest.NewRequest(http.MethodDelete, "/applications/app-1", nil)
	req.Header.Set("X-Test-User", teamAdmin.ID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusAccepted {
		t.Fatalf("expected 202 (intercepted by the approval workflow), got %d: %s", w.Code, w.Body.String())
	}

	var pending entity.ApprovalRequest
	if err := db.Where("action_type = ?", entity.ApprovalActionApplicationDelete).First(&pending).Error; err != nil {
		t.Fatalf("expected a pending application_delete request, got: %v", err)
	}

	ctx := context.Background()
	if err := globalApprovalUseCase.ApproveRequest(ctx, pending.ID, root); err != nil {
		t.Fatalf("failed to approve request: %v", err)
	}
	if err := globalApprovalUseCase.ExecuteApprovedAction(ctx, pending.ID, root); err != nil {
		t.Fatalf("failed to execute approved action: %v", err)
	}

	deletedText, deletedTarget := latestAuditTextAndTarget(t, router, "application_deleted")
	if want := "Deleted application <b>Checkout Web</b> (after approval)"; deletedText != want {
		t.Errorf("expected text %q, got %q", want, deletedText)
	}
	if deletedTarget != "" {
		t.Errorf("expected no target for application_deleted via approval (matches the real prototype's deleteApp pendingAction), got %q", deletedTarget)
	}
}

// Antes desta correção, middleware/approval.go embutia o nome da aplicação DENTRO da description
// ("Create application: Payment Service") e approval_requested/approved sempre gravavam target
// vazio — o nome só existia em negrito dentro do texto, nunca na segunda linha. Prova que agora a
// description fica curta (só "Create application") e o nome vira target, igual ao padrão real
// confirmado no AUDIT_SEED (au5) pra outros tipos de ação.
func TestAuditIntegration_ApprovalFlow_ApplicationCreate_DescriptionShortNameIsTarget(t *testing.T) {
	router, _, teamAdmin, _, root := setupAuditIntegrationTestRouter(t)

	enabled := true
	if _, err := globalApprovalUseCase.UpdateApprovalSettings(context.Background(), root.ID, &entity.UpdateApprovalSettingsRequest{
		ApprovalEnabled: &enabled,
		RequiredActions: &entity.ApprovalConfig{ApplicationCreate: true},
	}); err != nil {
		t.Fatalf("failed to enable approval settings: %v", err)
	}

	body, _ := json.Marshal(map[string]string{"name": "Payment Service", "team_id": "team-1"})
	req := httptest.NewRequest(http.MethodPost, "/applications", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Test-User", teamAdmin.ID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusAccepted {
		t.Fatalf("expected 202 (intercepted by the approval workflow), got %d: %s", w.Code, w.Body.String())
	}

	requestedText, requestedTarget := latestAuditTextAndTarget(t, router, "approval_requested")
	if want := "Requested: <b>Create application</b>"; requestedText != want {
		t.Errorf("expected text %q, got %q", want, requestedText)
	}
	if want := "Payment Service"; requestedTarget != want {
		t.Errorf("expected target (application name) %q, got %q", want, requestedTarget)
	}
}

// Bug real reportado em uso ao vivo: a Activity tab de uma aplicação CRIADA via aprovação nunca
// mostrava sequer o próprio evento de criação — "está faltando toda uma jornada que deveria estar
// sendo apresentado no activity". Causa raiz: `request.ApplicationID` é nil no momento do pedido
// (a aplicação ainda não existe), e `ExecuteApprovedAction` usava esse valor nil direto pra gravar
// o evento de execução — mesmo depois de `executeApplicationCreateAction` já ter criado a
// aplicação e conhecer seu ID de verdade.
func TestAuditIntegration_ApprovalFlow_ApplicationCreate_ExecutionEventCarriesNewApplicationID(t *testing.T) {
	router, db, teamAdmin, _, root := setupAuditIntegrationTestRouter(t)

	enabled := true
	if _, err := globalApprovalUseCase.UpdateApprovalSettings(context.Background(), root.ID, &entity.UpdateApprovalSettingsRequest{
		ApprovalEnabled: &enabled,
		RequiredActions: &entity.ApprovalConfig{ApplicationCreate: true},
	}); err != nil {
		t.Fatalf("failed to enable approval settings: %v", err)
	}

	body, _ := json.Marshal(map[string]string{"name": "Payment Service", "team_id": "team-1"})
	req := httptest.NewRequest(http.MethodPost, "/applications", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Test-User", teamAdmin.ID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusAccepted {
		t.Fatalf("expected 202 (intercepted by the approval workflow), got %d: %s", w.Code, w.Body.String())
	}

	var pending entity.ApprovalRequest
	if err := db.Where("action_type = ?", entity.ApprovalActionApplicationCreate).First(&pending).Error; err != nil {
		t.Fatalf("expected a pending application_create request, got: %v", err)
	}
	if pending.ApplicationID != nil {
		t.Fatalf("expected ApplicationID to be nil at request time (the application doesn't exist yet), got %v", *pending.ApplicationID)
	}

	if err := globalApprovalUseCase.ApproveRequest(context.Background(), pending.ID, root); err != nil {
		t.Fatalf("failed to approve: %v", err)
	}
	if err := globalApprovalUseCase.ExecuteApprovedAction(context.Background(), pending.ID, root); err != nil {
		t.Fatalf("failed to execute: %v", err)
	}

	var created entity.Application
	if err := db.Where("name = ?", "Payment Service").First(&created).Error; err != nil {
		t.Fatalf("expected the application to have been created: %v", err)
	}

	var stored entity.AuditLog
	if err := db.Where("event_type = ?", "application_created").First(&stored).Error; err != nil {
		t.Fatalf("expected an application_created entry: %v", err)
	}
	if stored.ApplicationID == nil || *stored.ApplicationID != created.ID {
		t.Errorf("expected the execution event to carry the newly created application_id=%q, got %+v", created.ID, stored.ApplicationID)
	}

	activityReq := httptest.NewRequest(http.MethodGet, "/applications/"+created.ID+"/audit", nil)
	activityReq.Header.Set("X-Test-User", teamAdmin.ID)
	activityW := httptest.NewRecorder()
	router.ServeHTTP(activityW, activityReq)
	if activityW.Code != http.StatusOK {
		t.Fatalf("expected 200 from GET .../audit, got %d: %s", activityW.Code, activityW.Body.String())
	}
	var resp struct {
		Data []struct {
			EventType string `json:"event_type"`
		} `json:"data"`
	}
	if err := json.Unmarshal(activityW.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	found := false
	for _, e := range resp.Data {
		if e.EventType == "application_created" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected the new application's own Activity feed to show its creation event, got %+v", resp.Data)
	}
}

// Mesmo template de ApproveRequest (sem ":", sufixo " request"), pro caso de rejeição.
func TestAuditIntegration_ApprovalFlow_Rejected_TextMatchesApprovedTemplate(t *testing.T) {
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

	var pending entity.ApprovalRequest
	if err := db.Where("action_type = ?", entity.ApprovalActionToggleCreate).First(&pending).Error; err != nil {
		t.Fatalf("expected a pending toggle_create request, got: %v", err)
	}

	if err := globalApprovalUseCase.RejectRequest(context.Background(), pending.ID, root, "not now"); err != nil {
		t.Fatalf("failed to reject request: %v", err)
	}

	rejectedText, rejectedTarget := latestAuditTextAndTarget(t, router, "approval_rejected")
	if want := "Rejected <b>Create toggle</b> request"; rejectedText != want {
		t.Errorf("expected text %q, got %q", want, rejectedText)
	}
	if want := "payments.new-feature"; rejectedTarget != want {
		t.Errorf("expected target (toggle path) %q, got %q", want, rejectedTarget)
	}
}

// v2.6 §7: before/after, filtro por ator, filtro por intervalo (range), lista de atores, e a
// Activity tab por aplicação — as 5 peças novas desta fase.

func TestAuditIntegration_ToggleRuleSet_RecordsBeforeAndAfter(t *testing.T) {
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
	req := httptest.NewRequest(http.MethodPut, "/applications/app-1/toggles/toggle-1", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Test-User", teamAdmin.ID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 setting the rule, got %d: %s", w.Code, w.Body.String())
	}

	var stored entity.AuditLog
	if err := db.Where("event_type = ?", "toggle_rule_set").First(&stored).Error; err != nil {
		t.Fatalf("expected a toggle_rule_set entry: %v", err)
	}
	if stored.Before == nil || *stored.Before != "No rule" {
		t.Errorf("expected before=%q, got %+v", "No rule", stored.Before)
	}
	if stored.After == nil || *stored.After != "percentage: 40%" {
		t.Errorf("expected after=%q, got %+v", "percentage: 40%", stored.After)
	}
	if stored.ApplicationID == nil || *stored.ApplicationID != "app-1" {
		t.Errorf("expected application_id=%q, got %+v", "app-1", stored.ApplicationID)
	}
}

func TestAuditIntegration_GetAuditLog_FiltersByActorAndRange(t *testing.T) {
	router, db, teamAdmin, _, _ := setupAuditIntegrationTestRouter(t)

	app := &entity.Application{ID: "app-1", Name: "Checkout Web"}
	if err := db.Create(app).Error; err != nil {
		t.Fatalf("failed to create application: %v", err)
	}
	if err := db.Create(&entity.TeamApplication{TeamID: "team-1", ApplicationID: app.ID, Permission: entity.PermissionAdmin}).Error; err != nil {
		t.Fatalf("failed to associate application to team: %v", err)
	}

	// Um evento recente de teamAdmin e um antigo de outro ator, os dois inseridos direto no
	// banco (mais simples que passar pelas rotas reais aqui — o que este teste exercita é o
	// filtro de GET /audit, não a gravação em si, já coberta pelos testes acima).
	recent := entity.NewAuditLog(entity.AuditEventToggleCreated, "Created toggle payments.card", "Checkout Web", stringPtr("team-1"), teamAdmin.ID, teamAdmin.Name)
	if err := db.Create(recent).Error; err != nil {
		t.Fatalf("failed to seed recent entry: %v", err)
	}

	old := entity.NewAuditLog(entity.AuditEventToggleDeleted, "Deleted toggle old", "Checkout Web", stringPtr("team-1"), "someone-else", "Someone Else")
	if err := db.Create(old).Error; err != nil {
		t.Fatalf("failed to seed old entry: %v", err)
	}
	if err := db.Model(&entity.AuditLog{}).Where("id = ?", old.ID).Update("created_at", time.Now().Add(-48*time.Hour)).Error; err != nil {
		t.Fatalf("failed to force created_at: %v", err)
	}

	t.Run("actor_id narrows to that one actor's events", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/audit?actor_id=someone-else", nil)
		req.Header.Set("X-Test-User", auditReaderID)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		var resp struct {
			Data []struct {
				ActorID string `json:"actor_id"`
			} `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("invalid JSON response: %v", err)
		}
		if len(resp.Data) != 1 || resp.Data[0].ActorID != "someone-else" {
			t.Fatalf("expected only someone-else's entry, got %+v", resp.Data)
		}
	})

	t.Run("range=24h excludes the 48h-old entry", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/audit?range=24h", nil)
		req.Header.Set("X-Test-User", auditReaderID)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		var resp struct {
			Data []struct {
				EventType string `json:"event_type"`
			} `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("invalid JSON response: %v", err)
		}
		for _, e := range resp.Data {
			if e.EventType == "toggle_deleted" {
				t.Errorf("expected the 48h-old entry to be excluded by range=24h, got %+v", resp.Data)
			}
		}
	})
}

// v2.6 §7: /audit/actors é root-only, mesmo motivo/mesma rota de GetAuditLog — substituiu o
// teste antigo desta função (TestAuditIntegration_GetAuditActors_ScopedByTeamLikeHistory), que
// provava visibilidade por time — comportamento removido, não mais aplicável.
func TestAuditIntegration_GetAuditActors_RootOnly(t *testing.T) {
	router, _, teamAdmin, otherTeamAdmin, root := setupAuditIntegrationTestRouter(t)

	body, _ := json.Marshal(map[string]string{"name": "Checkout Web", "team_id": "team-1"})
	req := httptest.NewRequest(http.MethodPost, "/applications", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Test-User", teamAdmin.ID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}

	for _, nonRoot := range []string{teamAdmin.ID, otherTeamAdmin.ID} {
		req := httptest.NewRequest(http.MethodGet, "/audit/actors", nil)
		req.Header.Set("X-Test-User", nonRoot)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code != http.StatusForbidden {
			t.Errorf("expected 403 for non-root caller %s, got %d: %s", nonRoot, w.Code, w.Body.String())
		}
	}

	req = httptest.NewRequest(http.MethodGet, "/audit/actors", nil)
	req.Header.Set("X-Test-User", root.ID)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 from GET /audit/actors for root, got %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Data []struct {
			Name string `json:"name"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	if len(resp.Data) != 1 || resp.Data[0].Name != "Admin One" {
		t.Errorf("expected root to see every actor, got %+v", resp.Data)
	}
}

func TestAuditIntegration_GetApplicationAudit_VisibleToAnyAuthenticatedUser(t *testing.T) {
	router, db, teamAdmin, otherTeamAdmin, _ := setupAuditIntegrationTestRouter(t)

	body, _ := json.Marshal(map[string]string{"name": "Checkout Web", "team_id": "team-1"})
	req := httptest.NewRequest(http.MethodPost, "/applications", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Test-User", teamAdmin.ID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var created entity.Application
	if err := db.Where("name = ?", "Checkout Web").First(&created).Error; err != nil {
		t.Fatalf("failed to find created application: %v", err)
	}

	fetchEventTypes := func(userID string) []string {
		req := httptest.NewRequest(http.MethodGet, "/applications/"+created.ID+"/audit", nil)
		req.Header.Set("X-Test-User", userID)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 from GET .../audit, got %d: %s", w.Code, w.Body.String())
		}
		var resp struct {
			Data []struct {
				EventType string `json:"event_type"`
			} `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("invalid JSON response: %v", err)
		}
		types := make([]string, len(resp.Data))
		for i, e := range resp.Data {
			types[i] = e.EventType
		}
		return types
	}

	// Diferente de GET /audit (History, escopado por time): a Activity de uma aplicação é
	// visível pra QUALQUER autenticado, mesmo de outro time — mesma postura de GET
	// /applications/:id, que também não checa time nenhum.
	for _, userID := range []string{teamAdmin.ID, otherTeamAdmin.ID} {
		if types := fetchEventTypes(userID); len(types) != 1 || types[0] != "application_created" {
			t.Errorf("user %s: expected to see application_created, got %v", userID, types)
		}
	}
}

func stringPtr(s string) *string { return &s }
