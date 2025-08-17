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

func setupTeamTestRouter() (*gin.Engine, *gorm.DB) {
	gin.SetMode(gin.TestMode)
	
	// Cria base de dados em memória para testes
	db, _ := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	
	// Auto migrate tables
	db.AutoMigrate(&entity.Application{}, &entity.Toggle{}, &entity.User{}, &entity.SecretKey{}, 
		&entity.Team{}, &entity.TeamUser{}, &entity.TeamApplication{})
	
	// Inicializa handlers com a base de dados de teste
	InitHandlers(db)
	
	// Cria router de teste
	router := gin.New()
	
	// Mock root user middleware
	router.Use(func(c *gin.Context) {
		c.Set("user", &entity.User{
			ID:       "test-root-id",
			Username: "root",
			Role:     entity.UserRoleRoot,
		})
		c.Next()
	})
	
	// Rotas de teams
	teams := router.Group("/teams")
	{
		teams.POST("", CreateTeam)
		teams.GET("", GetAllTeams)
		teams.GET("/:id", GetTeam)
		teams.PUT("/:id", UpdateTeam)
		teams.DELETE("/:id", DeleteTeam)
		
		// Gestão de usuários
		teams.POST("/:id/users", AddUserToTeam)
		teams.DELETE("/:id/users/:user_id", RemoveUserFromTeam)
		teams.GET("/:id/users", GetTeamUsers)
		
		// Gestão de aplicações
		teams.POST("/:id/applications", AddApplicationToTeam)
		teams.DELETE("/:id/applications/:app_id", RemoveApplicationFromTeam)
		teams.PUT("/:id/applications/:app_id", UpdateApplicationPermission)
		teams.GET("/:id/applications", GetTeamApplications)
	}
	
	return router, db
}

func TestCreateTeam_Success(t *testing.T) {
	router, _ := setupTeamTestRouter()

	requestBody := CreateTeamRequest{
		Name:        "Development Team",
		Description: "Team for development projects",
	}
	
	jsonBody, _ := json.Marshal(requestBody)
	
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/teams", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("Expected status 201, got %d", w.Code)
	}

	var response TeamResponse
	json.Unmarshal(w.Body.Bytes(), &response)

	if !response.Success {
		t.Error("Expected success to be true")
	}

	if response.Team.Name != "Development Team" {
		t.Errorf("Expected team name 'Development Team', got %s", response.Team.Name)
	}

	if response.Team.Description != "Team for development projects" {
		t.Errorf("Expected description 'Team for development projects', got %s", response.Team.Description)
	}
}

func TestCreateTeam_DuplicateName(t *testing.T) {
	router, db := setupTeamTestRouter()

	// Criar time existente
	existingTeam := &entity.Team{
		Name:        "Test Team",
		Description: "Existing team",
	}
	db.Create(existingTeam)

	requestBody := CreateTeamRequest{
		Name:        "Test Team",
		Description: "New team with same name",
	}
	
	jsonBody, _ := json.Marshal(requestBody)
	
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/teams", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", w.Code)
	}

	var response TeamResponse
	json.Unmarshal(w.Body.Bytes(), &response)

	if response.Success {
		t.Error("Expected success to be false")
	}

	if response.Error != "team name already exists" {
		t.Errorf("Expected error 'team name already exists', got: %s", response.Error)
	}
}

func TestGetAllTeams(t *testing.T) {
	router, db := setupTeamTestRouter()

	// Criar alguns times de teste
	team1 := &entity.Team{
		Name:        "Team 1",
		Description: "First team",
	}
	team2 := &entity.Team{
		Name:        "Team 2", 
		Description: "Second team",
	}
	db.Create(team1)
	db.Create(team2)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/teams", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var response TeamsResponse
	json.Unmarshal(w.Body.Bytes(), &response)

	if !response.Success {
		t.Error("Expected success to be true")
	}

	if len(response.Teams) < 2 {
		t.Errorf("Expected at least 2 teams, got %d", len(response.Teams))
	}
}

func TestGetTeam_Success(t *testing.T) {
	router, db := setupTeamTestRouter()

	// Criar time de teste
	team := &entity.Team{
		Name:        "Test Team",
		Description: "Test team description",
	}
	db.Create(team)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/teams/"+team.ID, nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var response TeamResponse
	json.Unmarshal(w.Body.Bytes(), &response)

	if !response.Success {
		t.Error("Expected success to be true")
	}

	if response.Team.ID != team.ID {
		t.Errorf("Expected team ID %s, got %s", team.ID, response.Team.ID)
	}
}

func TestGetTeam_NotFound(t *testing.T) {
	router, _ := setupTeamTestRouter()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/teams/nonexistent", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("Expected status 404, got %d", w.Code)
	}

	var response TeamResponse
	json.Unmarshal(w.Body.Bytes(), &response)

	if response.Success {
		t.Error("Expected success to be false")
	}
}

func TestUpdateTeam_Success(t *testing.T) {
	router, db := setupTeamTestRouter()

	// Criar time de teste
	team := &entity.Team{
		Name:        "Original Team",
		Description: "Original description",
	}
	db.Create(team)

	requestBody := UpdateTeamRequest{
		Name:        "Updated Team",
		Description: "Updated description",
	}
	
	jsonBody, _ := json.Marshal(requestBody)
	
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("PUT", "/teams/"+team.ID, bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var response TeamResponse
	json.Unmarshal(w.Body.Bytes(), &response)

	if !response.Success {
		t.Error("Expected success to be true")
	}

	if response.Team.Name != "Updated Team" {
		t.Errorf("Expected updated name 'Updated Team', got %s", response.Team.Name)
	}
}

func TestDeleteTeam_Success(t *testing.T) {
	router, db := setupTeamTestRouter()

	// Criar time de teste
	team := &entity.Team{
		Name:        "Team to Delete",
		Description: "This team will be deleted",
	}
	db.Create(team)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("DELETE", "/teams/"+team.ID, nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var response map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &response)

	if !response["success"].(bool) {
		t.Error("Expected success to be true")
	}

	// Verificar se foi deletado do banco
	var deletedTeam entity.Team
	err := db.First(&deletedTeam, "id = ?", team.ID).Error
	if err == nil {
		t.Error("Team should have been deleted from database")
	}
}

func TestAddUserToTeam_Success(t *testing.T) {
	router, db := setupTeamTestRouter()

	// Criar time e usuário de teste
	team := &entity.Team{
		Name: "Test Team",
	}
	user := &entity.User{
		Username: "testuser",
		Role:     entity.UserRoleUser,
	}
	user.SetPassword("password")
	db.Create(team)
	db.Create(user)

	requestBody := AddUserToTeamRequest{
		UserID: user.ID,
	}
	
	jsonBody, _ := json.Marshal(requestBody)
	
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/teams/"+team.ID+"/users", bytes.NewBuffer(jsonBody))
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

	// Verificar se o usuário foi adicionado ao time
	var teamUser entity.TeamUser
	err := db.First(&teamUser, "team_id = ? AND user_id = ?", team.ID, user.ID).Error
	if err != nil {
		t.Errorf("User should have been added to team: %v", err)
	}
}

func TestAddApplicationToTeam_Success(t *testing.T) {
	router, db := setupTeamTestRouter()

	// Criar time e aplicação de teste
	team := &entity.Team{
		Name: "Test Team",
	}
	app := entity.NewApplication("Test App")
	db.Create(team)
	db.Create(app)

	requestBody := AddApplicationToTeamRequest{
		ApplicationID: app.ID,
		Permission:    "write",
	}
	
	jsonBody, _ := json.Marshal(requestBody)
	
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/teams/"+team.ID+"/applications", bytes.NewBuffer(jsonBody))
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

	// Verificar se a aplicação foi adicionada ao time com a permissão correta
	var teamApp entity.TeamApplication
	err := db.First(&teamApp, "team_id = ? AND application_id = ?", team.ID, app.ID).Error
	if err != nil {
		t.Errorf("Application should have been added to team: %v", err)
	}

	if teamApp.Permission != entity.PermissionWrite {
		t.Errorf("Expected permission 'write', got %s", teamApp.Permission)
	}
}