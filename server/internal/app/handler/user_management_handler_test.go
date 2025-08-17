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

func setupUserManagementTestRouter() (*gin.Engine, *gorm.DB) {
	gin.SetMode(gin.TestMode)
	
	// Cria base de dados em memória para testes
	db, _ := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	
	// Auto migrate tables
	db.AutoMigrate(&entity.Application{}, &entity.Toggle{}, &entity.User{}, &entity.SecretKey{})
	
	// Inicializa handlers com a base de dados de teste
	InitHandlers(db)
	
	// Cria router de teste
	router := gin.New()
	
	// Rotas de gestão de usuários
	userManagement := router.Group("/users")
	userManagement.Use(func(c *gin.Context) {
		// Mock root user middleware
		c.Set("user", &entity.User{
			ID:       "test-root-id",
			Username: "root",
			Role:     entity.UserRoleRoot,
		})
		c.Next()
	})
	{
		userManagement.POST("", CreateUser)
		userManagement.GET("", ListUsers)
		userManagement.DELETE("/:id", DeleteUser)
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
	
	return router, db
}

func TestCreateUser_Success(t *testing.T) {
	router, db := setupUserManagementTestRouter()

	requestBody := CreateUserManagementRequest{
		Username: "newuser",
		Role:     "admin",
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

	// Verificar se o usuário foi criado no banco
	var user entity.User
	err := db.Where("username = ?", "newuser").First(&user).Error
	if err != nil {
		t.Errorf("User not found in database: %v", err)
	}
}

func TestCreateUser_CannotCreateRoot(t *testing.T) {
	router, _ := setupUserManagementTestRouter()

	requestBody := CreateUserManagementRequest{
		Username: "rootuser",
		Role:     "root",
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

func TestCreateUser_InvalidRole(t *testing.T) {
	router, _ := setupUserManagementTestRouter()

	requestBody := CreateUserManagementRequest{
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

func TestListUsers(t *testing.T) {
	router, db := setupUserManagementTestRouter()

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
	router, db := setupUserManagementTestRouter()

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
	router, db := setupUserManagementTestRouter()

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
	router, _ := setupUserManagementTestRouter()

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