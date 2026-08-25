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

// setupUserManagementTestRouter monta o router com o usuário root mockado no contexto (a
// maioria dos testes já existentes espera isso), e devolve também o ID de um time real já
// criado no banco — necessário porque team_id agora é obrigatório na criação de usuário
// (confirmado no protótipo: o time é escolhido na própria criação, não é mais um passo
// separado).
func setupUserManagementTestRouter() (*gin.Engine, *gorm.DB, string) {
	return setupUserManagementTestRouterAs(&entity.User{
		ID:       "test-root-id",
		Username: "root",
		Role:     entity.UserRoleRoot,
	})
}

// setupUserManagementTestRouterAs monta o router com o usuário informado como o "usuário
// autenticado" no contexto — usado pelos testes que precisam de um admin (não root) pra exercer
// o escopo por time. Devolve também o ID de um time real já criado no banco, pra uso em
// TeamID nos corpos de requisição.
func setupUserManagementTestRouterAs(mockUser *entity.User) (*gin.Engine, *gorm.DB, string) {
	gin.SetMode(gin.TestMode)

	// Cria base de dados em memória para testes
	db, _ := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})

	// Auto migrate tables
	db.AutoMigrate(&entity.Application{}, &entity.Toggle{}, &entity.User{}, &entity.SecretKey{},
		&entity.Team{}, &entity.TeamUser{}, &entity.TeamApplication{})

	// Inicializa handlers com a base de dados de teste — semeia um usuário root real (log
	// "USUÁRIO ROOT CRIADO"). Um mock "root" com ID inventado não existiria no banco, o que
	// quebra qualquer usecase que precise carregar o usuário autenticado por ID (ex.:
	// SetTeamApprover, que confere se quem chama é root) — por isso, quando mockUser é root,
	// realinhamos seu ID com o root de verdade já semeado em vez de inventar um novo.
	InitHandlers(db)
	if mockUser.Role == entity.UserRoleRoot {
		var seededRoot entity.User
		db.Where("role = ?", entity.UserRoleRoot).First(&seededRoot)
		mockUser.ID = seededRoot.ID
	} else {
		db.Create(mockUser)
	}

	team := &entity.Team{Name: "Payments"}
	db.Create(team)

	// Cria router de teste
	router := gin.New()

	// Rotas de gestão de usuários
	userManagement := router.Group("/users")
	userManagement.Use(func(c *gin.Context) {
		c.Set("user", mockUser)
		c.Next()
	})
	{
		userManagement.POST("", CreateUser)
		userManagement.GET("", ListUsers)
		userManagement.DELETE("/:id", DeleteUser)
		userManagement.POST("/:id/reset-password", ResetUserPassword)
		userManagement.PUT("/:id/status", SetUserStatus)
	}

	// Rotas de perfil
	profile := router.Group("/profile")
	profile.Use(func(c *gin.Context) {
		// Mock user middleware
		c.Set("user", &entity.User{
			ID:       "test-user-id",
			Username: "testuser",
			Role:     entity.UserRoleUser,
		})
		c.Next()
	})
	{
		profile.GET("", GetCurrentUser)
		profile.POST("/change-password", ChangePassword)
	}

	return router, db, team.ID
}

func TestCreateUser_Success(t *testing.T) {
	router, db, teamID := setupUserManagementTestRouter()

	requestBody := CreateUserManagementRequest{
		Username: "newuser",
		Role:     "admin",
		TeamID:   teamID,
	}

	jsonBody, _ := json.Marshal(requestBody)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/users", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("Expected status 201, got %d", w.Code)
	}

	var response CreateUserManagementResponse
	json.Unmarshal(w.Body.Bytes(), &response)

	if !response.Success {
		t.Error("Expected success to be true")
	}

	if response.User.Username != "newuser" {
		t.Errorf("Expected username 'newuser', got %s", response.User.Username)
	}

	if response.User.Role != entity.UserRoleAdmin {
		t.Errorf("Expected role 'admin', got %s", response.User.Role)
	}

	if !response.User.MustChangePassword {
		t.Error("Expected MustChangePassword to be true")
	}

	if response.Password == "" {
		t.Error("Expected password to be generated")
	}

	if response.User.Status != "pending_first_login" {
		t.Errorf("Expected status 'pending_first_login' right after creation, got %q", response.User.Status)
	}

	if response.Warning != "" {
		t.Errorf("Expected no warning on a clean creation, got: %s", response.Warning)
	}

	// Verificar se o usuário foi criado no banco
	var user entity.User
	err := db.Where("username = ?", "newuser").First(&user).Error
	if err != nil {
		t.Errorf("User not found in database: %v", err)
	}

	// Verificar se o usuário foi associado ao time informado (confirmado no protótipo: o time é
	// escolhido na própria criação, não é mais um passo separado depois).
	var count int64
	db.Table("team_users").Where("user_id = ? AND team_id = ?", user.ID, teamID).Count(&count)
	if count != 1 {
		t.Errorf("Expected the new user to be associated with team %s, found %d rows", teamID, count)
	}
}

func TestCreateUser_CannotCreateRoot(t *testing.T) {
	router, _, teamID := setupUserManagementTestRouter()

	requestBody := CreateUserManagementRequest{
		Username: "rootuser",
		Role:     "root",
		TeamID:   teamID,
	}

	jsonBody, _ := json.Marshal(requestBody)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/users", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", w.Code)
	}

	var response CreateUserManagementResponse
	json.Unmarshal(w.Body.Bytes(), &response)

	if response.Success {
		t.Error("Expected success to be false")
	}

	if response.Error != "Cannot create additional root users" {
		t.Errorf("Expected error message about root users, got: %s", response.Error)
	}
}

// Bug real encontrado ao vivo: criar um usuário com username já existente devolvia 500
// (Internal Server Error) em vez de 409 — o handler não distinguia um conflito esperado
// (username duplicado) de uma falha de infraestrutura de verdade.
func TestCreateUser_DuplicateUsername(t *testing.T) {
	router, _, teamID := setupUserManagementTestRouter()

	requestBody := CreateUserManagementRequest{Username: "bob", Role: "admin", TeamID: teamID}
	jsonBody, _ := json.Marshal(requestBody)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/users", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("setup: expected first creation to succeed with 201, got %d: %s", w.Code, w.Body.String())
	}

	w = httptest.NewRecorder()
	req, _ = http.NewRequest("POST", "/users", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusConflict {
		t.Errorf("expected status 409 for a duplicate username, got %d: %s", w.Code, w.Body.String())
	}
}

func TestCreateUser_InvalidRole(t *testing.T) {
	router, _, teamID := setupUserManagementTestRouter()

	requestBody := CreateUserManagementRequest{
		TeamID:   teamID,
		Username: "testuser",
		Role:     "invalid",
	}

	jsonBody, _ := json.Marshal(requestBody)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/users", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", w.Code)
	}

	var response CreateUserManagementResponse
	json.Unmarshal(w.Body.Bytes(), &response)

	if response.Success {
		t.Error("Expected success to be false")
	}

	if response.Error != "Invalid role. Must be 'admin' or 'user'" {
		t.Errorf("Expected error message about invalid role, got: %s", response.Error)
	}
}

// Confirmado no protótipo (get_full_jsx("UserModal")): admin cria usuários, mas só nos times de
// que já participa.
func TestCreateUser_AdminCanCreateInOwnTeam(t *testing.T) {
	admin := &entity.User{ID: "admin-1", Username: "admin1", Role: entity.UserRoleAdmin}
	router, _, teamID := setupUserManagementTestRouterAs(admin)
	admin.Teams = []*entity.Team{{ID: teamID}}

	requestBody := CreateUserManagementRequest{Username: "newbie", Role: "user", TeamID: teamID}
	jsonBody, _ := json.Marshal(requestBody)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/users", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
}

func TestCreateUser_AdminCannotCreateOutsideOwnTeams(t *testing.T) {
	admin := &entity.User{ID: "admin-1", Username: "admin1", Role: entity.UserRoleAdmin}
	router, _, teamID := setupUserManagementTestRouterAs(admin)
	// admin.Teams fica vazio de propósito — não é membro do time que está tentando usar.

	requestBody := CreateUserManagementRequest{Username: "newbie", Role: "user", TeamID: teamID}
	jsonBody, _ := json.Marshal(requestBody)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/users", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d: %s", w.Code, w.Body.String())
	}
}

func TestCreateUser_UnknownTeam(t *testing.T) {
	router, _, _ := setupUserManagementTestRouter()

	requestBody := CreateUserManagementRequest{Username: "newbie", Role: "user", TeamID: "does-not-exist"}
	jsonBody, _ := json.Marshal(requestBody)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/users", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

// Confirmado no protótipo: o switch "Aprovador do time" só existe quando ROOT cria um ADMIN —
// o servidor reforça essa regra mesmo que o request tente burlar.
func TestCreateUser_ApproverFlag(t *testing.T) {
	t.Run("root creating an admin with is_approver sets it", func(t *testing.T) {
		router, db, teamID := setupUserManagementTestRouter()

		requestBody := CreateUserManagementRequest{Username: "newadmin", Role: "admin", TeamID: teamID, IsApprover: true}
		jsonBody, _ := json.Marshal(requestBody)

		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/users", bytes.NewBuffer(jsonBody))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		var response CreateUserManagementResponse
		json.Unmarshal(w.Body.Bytes(), &response)
		if response.Warning != "" {
			t.Fatalf("unexpected warning: %s", response.Warning)
		}

		var approver bool
		db.Table("team_users").Select("is_approver").Where("team_id = ? AND user_id = ?", teamID, response.User.ID).Scan(&approver)
		if !approver {
			t.Error("expected the new admin to be set as a team approver")
		}
	})

	t.Run("is_approver is ignored when creating a plain user, even for root", func(t *testing.T) {
		router, db, teamID := setupUserManagementTestRouter()

		requestBody := CreateUserManagementRequest{Username: "newuser2", Role: "user", TeamID: teamID, IsApprover: true}
		jsonBody, _ := json.Marshal(requestBody)

		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/users", bytes.NewBuffer(jsonBody))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		var response CreateUserManagementResponse
		json.Unmarshal(w.Body.Bytes(), &response)

		var approver bool
		db.Table("team_users").Select("is_approver").Where("team_id = ? AND user_id = ?", teamID, response.User.ID).Scan(&approver)
		if approver {
			t.Error("a plain 'user' role must never be settable as approver")
		}
	})

	t.Run("is_approver is ignored when an admin (not root) creates another admin", func(t *testing.T) {
		creatorAdmin := &entity.User{ID: "admin-1", Username: "admin1", Role: entity.UserRoleAdmin}
		router, db, teamID := setupUserManagementTestRouterAs(creatorAdmin)
		creatorAdmin.Teams = []*entity.Team{{ID: teamID}}

		requestBody := CreateUserManagementRequest{Username: "newadmin2", Role: "admin", TeamID: teamID, IsApprover: true}
		jsonBody, _ := json.Marshal(requestBody)

		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/users", bytes.NewBuffer(jsonBody))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		var response CreateUserManagementResponse
		json.Unmarshal(w.Body.Bytes(), &response)

		var approver bool
		db.Table("team_users").Select("is_approver").Where("team_id = ? AND user_id = ?", teamID, response.User.ID).Scan(&approver)
		if approver {
			t.Error("only root may set the approver flag at creation time")
		}
	})
}

// Confirmado no protótipo (page-desc de UsersView): sem isso, "admin cria usuários" não teria
// como conferir o resultado — admin só vê a si mesmo e quem compartilha um time consigo.
func TestListUsers_AdminSeesOnlySharedTeamMembers(t *testing.T) {
	admin := &entity.User{ID: "admin-1", Username: "admin1", Role: entity.UserRoleAdmin}
	router, db, teamID := setupUserManagementTestRouterAs(admin)
	admin.Teams = []*entity.Team{{ID: teamID}}
	db.Exec("INSERT INTO team_users (team_id, user_id, is_approver) VALUES (?, ?, false)", teamID, admin.ID)

	teammate := &entity.User{ID: "teammate-1", Username: "teammate", Role: entity.UserRoleUser}
	teammate.SetPassword("password123")
	db.Create(teammate)
	db.Exec("INSERT INTO team_users (team_id, user_id, is_approver) VALUES (?, ?, false)", teamID, teammate.ID)

	stranger := &entity.User{ID: "stranger-1", Username: "stranger", Role: entity.UserRoleUser}
	stranger.SetPassword("password123")
	db.Create(stranger)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/users", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var response ListUsersResponse
	json.Unmarshal(w.Body.Bytes(), &response)

	seen := make(map[string]bool)
	for _, u := range response.Users {
		seen[u.Username] = true
	}
	if !seen["admin1"] {
		t.Error("admin should see themselves in the list")
	}
	if !seen["teammate"] {
		t.Error("admin should see a user sharing a team with them")
	}
	if seen["stranger"] {
		t.Error("admin should NOT see a user with no shared team")
	}
}

func TestResetUserPassword_GeneratesNewPasswordAndForcesChange(t *testing.T) {
	router, db, _ := setupUserManagementTestRouter()

	target := &entity.User{ID: "u1", Username: "target", Role: entity.UserRoleUser}
	target.SetPassword("originalpassword")
	db.Create(target)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/users/u1/reset-password", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var response ResetPasswordResponse
	json.Unmarshal(w.Body.Bytes(), &response)
	if response.Password == "" {
		t.Error("expected a new temporary password to be returned")
	}
	if response.User.Status != "pending_first_login" {
		t.Errorf("expected status 'pending_first_login' after a reset, got %q", response.User.Status)
	}

	var updated entity.User
	db.First(&updated, "id = ?", "u1")
	if updated.CheckPassword("originalpassword") {
		t.Error("the original password must no longer work")
	}
	if !updated.CheckPassword(response.Password) {
		t.Error("the returned password must be the one now stored")
	}
	if !updated.MustChangePassword {
		t.Error("expected must_change_password to be set after a reset")
	}
}

func TestResetUserPassword_CannotResetRoot(t *testing.T) {
	router, db, _ := setupUserManagementTestRouter()

	var rootUser entity.User
	db.Where("username = ?", "root").First(&rootUser)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/users/"+rootUser.ID+"/reset-password", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d: %s", w.Code, w.Body.String())
	}
}

func TestSetUserStatus_DisableAndReactivate(t *testing.T) {
	router, db, _ := setupUserManagementTestRouter()

	target := &entity.User{ID: "u1", Username: "target", Role: entity.UserRoleUser, Active: true}
	target.SetPassword("password123")
	db.Create(target)

	body, _ := json.Marshal(SetUserStatusRequest{Active: false})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("PUT", "/users/u1/status", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 disabling, got %d: %s", w.Code, w.Body.String())
	}
	var disabled entity.User
	db.First(&disabled, "id = ?", "u1")
	if disabled.Active {
		t.Error("expected the user to be disabled")
	}
	if disabled.Status != "disabled" {
		t.Errorf("expected status 'disabled', got %q", disabled.Status)
	}

	body, _ = json.Marshal(SetUserStatusRequest{Active: true})
	w = httptest.NewRecorder()
	req, _ = http.NewRequest("PUT", "/users/u1/status", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 reactivating, got %d: %s", w.Code, w.Body.String())
	}
	var reactivated entity.User
	db.First(&reactivated, "id = ?", "u1")
	if !reactivated.Active {
		t.Error("expected the user to be active again")
	}
}

func TestSetUserStatus_CannotDisableRoot(t *testing.T) {
	router, db, _ := setupUserManagementTestRouter()

	var rootUser entity.User
	db.Where("username = ?", "root").First(&rootUser)

	body, _ := json.Marshal(SetUserStatusRequest{Active: false})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("PUT", "/users/"+rootUser.ID+"/status", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d: %s", w.Code, w.Body.String())
	}
}

// Confirmado no protótipo (canManageUser): admin gerencia (reset de senha, desativar) qualquer
// usuário que compartilhe pelo menos um time consigo — inclusive outro admin — mas nunca a si
// mesmo nem alguém fora do seu escopo.
func TestResetUserPassword_AdminScopedToSharedTeam(t *testing.T) {
	admin := &entity.User{ID: "admin-1", Username: "admin1", Role: entity.UserRoleAdmin}
	router, db, teamID := setupUserManagementTestRouterAs(admin)
	admin.Teams = []*entity.Team{{ID: teamID}}
	db.Exec("INSERT INTO team_users (team_id, user_id, is_approver) VALUES (?, ?, false)", teamID, admin.ID)

	teammate := &entity.User{ID: "teammate-1", Username: "teammate", Role: entity.UserRoleUser}
	teammate.SetPassword("password123")
	db.Create(teammate)
	db.Exec("INSERT INTO team_users (team_id, user_id, is_approver) VALUES (?, ?, false)", teamID, teammate.ID)

	stranger := &entity.User{ID: "stranger-1", Username: "stranger", Role: entity.UserRoleUser}
	stranger.SetPassword("password123")
	db.Create(stranger)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/users/teammate-1/reset-password", nil)
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200 resetting a teammate's password, got %d: %s", w.Code, w.Body.String())
	}

	w = httptest.NewRecorder()
	req, _ = http.NewRequest("POST", "/users/stranger-1/reset-password", nil)
	router.ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403 resetting a stranger's password, got %d: %s", w.Code, w.Body.String())
	}

	w = httptest.NewRecorder()
	req, _ = http.NewRequest("POST", "/users/admin-1/reset-password", nil)
	router.ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403 resetting one's own password via this route, got %d: %s", w.Code, w.Body.String())
	}
}

func TestCanManageUser(t *testing.T) {
	root := &entity.User{ID: "root-1", Role: entity.UserRoleRoot}
	admin := &entity.User{ID: "admin-1", Role: entity.UserRoleAdmin, Teams: []*entity.Team{{ID: "t1"}}}
	otherAdminSameTeam := &entity.User{ID: "admin-2", Role: entity.UserRoleAdmin, Teams: []*entity.Team{{ID: "t1"}}}
	adminOtherTeam := &entity.User{ID: "admin-3", Role: entity.UserRoleAdmin, Teams: []*entity.Team{{ID: "t2"}}}
	plainUser := &entity.User{ID: "user-1", Role: entity.UserRoleUser}

	if !canManageUser(root, admin) {
		t.Error("root should manage any non-root, non-self user")
	}
	if canManageUser(root, root) {
		t.Error("root should never manage itself")
	}
	if !canManageUser(admin, otherAdminSameTeam) {
		t.Error("admin should manage another admin sharing a team, even though both are admins")
	}
	if canManageUser(admin, adminOtherTeam) {
		t.Error("admin should not manage a user with no shared team")
	}
	if canManageUser(admin, admin) {
		t.Error("admin should never manage itself")
	}
	if canManageUser(plainUser, admin) {
		t.Error("a plain user role should never manage anyone")
	}
}

func TestListUsers(t *testing.T) {
	router, db, _ := setupUserManagementTestRouter()

	// Criar alguns usuários de teste
	user1 := &entity.User{
		ID:       "user1",
		Username: "testuser1",
		Role:     entity.UserRoleAdmin,
	}
	user1.SetPassword("password123")
	db.Create(user1)

	user2 := &entity.User{
		ID:       "user2",
		Username: "testuser2",
		Role:     entity.UserRoleUser,
	}
	user2.SetPassword("password123")
	db.Create(user2)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/users", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var response ListUsersResponse
	json.Unmarshal(w.Body.Bytes(), &response)

	if !response.Success {
		t.Error("Expected success to be true")
	}

	// Deveria ter pelo menos 2 usuários criados manualmente + o root automático
	if len(response.Users) < 2 {
		t.Errorf("Expected at least 2 users, got %d", len(response.Users))
	}
}

func TestDeleteUser_Success(t *testing.T) {
	router, db, _ := setupUserManagementTestRouter()

	// Criar um usuário de teste
	user := &entity.User{
		ID:       "user-to-delete",
		Username: "deleteuser",
		Role:     entity.UserRoleUser,
	}
	user.SetPassword("password123")
	db.Create(user)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("DELETE", "/users/user-to-delete", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var response map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &response)

	if !response["success"].(bool) {
		t.Error("Expected success to be true")
	}

	// Verificar se o usuário foi deletado do banco
	var deletedUser entity.User
	err := db.Where("id = ?", "user-to-delete").First(&deletedUser).Error
	if err == nil {
		t.Error("User should have been deleted from database")
	}
}

func TestDeleteUser_CannotDeleteRoot(t *testing.T) {
	router, db, _ := setupUserManagementTestRouter()

	// Buscar o usuário root que foi criado automaticamente
	var rootUser entity.User
	db.Where("username = ?", "root").First(&rootUser)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("DELETE", "/users/"+rootUser.ID, nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("Expected status 403, got %d", w.Code)
	}

	var response map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &response)

	if response["success"].(bool) {
		t.Error("Expected success to be false")
	}

	if response["error"] != "Cannot delete root user" {
		t.Errorf("Expected error message about root user, got: %s", response["error"])
	}
}

func TestChangePassword_Success(t *testing.T) {
	gin.SetMode(gin.TestMode)

	// Cria base de dados em memória para testes
	db, _ := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})

	// Auto migrate tables
	db.AutoMigrate(&entity.Application{}, &entity.Toggle{}, &entity.User{}, &entity.SecretKey{})

	// Inicializa handlers com a base de dados de teste
	InitHandlers(db)

	// Criar um usuário de teste
	testUser := &entity.User{
		ID:                 "test-user-id",
		Username:           "testuser",
		Role:               entity.UserRoleUser,
		MustChangePassword: true,
	}
	testUser.SetPassword("oldpassword")
	db.Create(testUser)

	// Criar router de teste específico para este teste
	router := gin.New()
	profile := router.Group("/profile")
	profile.Use(func(c *gin.Context) {
		c.Set("user", testUser)
		c.Next()
	})
	{
		profile.POST("/change-password", ChangePassword)
	}

	requestBody := ChangePasswordManagementRequest{
		CurrentPassword: "oldpassword",
		NewPassword:     "newpassword123",
	}

	jsonBody, _ := json.Marshal(requestBody)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/profile/change-password", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var response map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &response)

	if !response["success"].(bool) {
		t.Error("Expected success to be true")
	}

	// Verificar se a senha foi alterada no banco
	var updatedUser entity.User
	db.First(&updatedUser, "id = ?", "test-user-id")

	if !updatedUser.CheckPassword("newpassword123") {
		t.Error("Password was not updated correctly")
	}

	if updatedUser.MustChangePassword {
		t.Error("MustChangePassword should be false after password change")
	}
}

func TestChangePassword_WrongCurrentPassword(t *testing.T) {
	gin.SetMode(gin.TestMode)

	// Cria base de dados em memória para testes
	db, _ := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})

	// Auto migrate tables
	db.AutoMigrate(&entity.Application{}, &entity.Toggle{}, &entity.User{}, &entity.SecretKey{})

	// Inicializa handlers com a base de dados de teste
	InitHandlers(db)

	// Criar um usuário de teste
	testUser := &entity.User{
		ID:       "test-user-id",
		Username: "testuser",
		Role:     entity.UserRoleUser,
	}
	testUser.SetPassword("correctpassword")
	db.Create(testUser)

	// Criar router de teste específico
	router := gin.New()
	profile := router.Group("/profile")
	profile.Use(func(c *gin.Context) {
		c.Set("user", testUser)
		c.Next()
	})
	{
		profile.POST("/change-password", ChangePassword)
	}

	requestBody := ChangePasswordManagementRequest{
		CurrentPassword: "wrongpassword",
		NewPassword:     "newpassword123",
	}

	jsonBody, _ := json.Marshal(requestBody)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/profile/change-password", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected status 401, got %d", w.Code)
	}

	var response map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &response)

	if response["success"].(bool) {
		t.Error("Expected success to be false")
	}

	if response["error"] != "Current password is incorrect" {
		t.Errorf("Expected error message about incorrect password, got: %s", response["error"])
	}
}

func TestGetCurrentUser(t *testing.T) {
	router, _, _ := setupUserManagementTestRouter()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/profile", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var response map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &response)

	if !response["success"].(bool) {
		t.Error("Expected success to be true")
	}

	user := response["user"].(map[string]interface{})
	if user["username"] != "testuser" {
		t.Errorf("Expected username 'testuser', got %s", user["username"])
	}

	if user["role"] != "user" {
		t.Errorf("Expected role 'user', got %s", user["role"])
	}
}
