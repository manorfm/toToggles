package handler

import (
	"github.com/gin-gonic/gin"
	"github.com/manorfm/totoogle/internal/app/domain/auth"
	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/infrastructure/database"
	"github.com/manorfm/totoogle/internal/app/usecase"
	"gorm.io/gorm"
)

var (
	appHandler            *ApplicationHandler
	toggleHandler         *ToggleHandler
	authHandler           *AuthHandler
	userHandler           *UserHandler
	userManagementHandler *UserManagementHandler
	teamHandler           *TeamHandler
	secretKeyHandler      *SecretKeyHandler
)

// InitHandlers inicializa os handlers
func InitHandlers(db *gorm.DB) {
	// Inicializa repositórios
	appRepo := database.NewApplicationRepository(db)
	toggleRepo := database.NewToggleRepository(db)
	userRepo := database.NewUserRepository(db)
	teamRepo := database.NewTeamRepository(db)
	secretKeyRepo := database.NewSecretKeyRepository(db)

	// Inicializa sistema de autenticação
	authManager := auth.NewAuthManager()
	localStrategy := auth.NewLocalAuthStrategy(userRepo, []byte("jwt-secret-key"))
	authManager.RegisterStrategy("local", localStrategy)

	// Inicializa use cases
	appUseCase := usecase.NewApplicationUseCase(appRepo)
	toggleUseCase := usecase.NewToggleUseCase(toggleRepo, appRepo)
	authUseCase := usecase.NewAuthUseCase(userRepo, authManager)
	userUseCase := usecase.NewUserUseCase(userRepo)
	teamUseCase := usecase.NewTeamUseCase(teamRepo, userRepo, appRepo)
	secretKeyUseCase := usecase.NewSecretKeyUseCase(secretKeyRepo)

	// Inicializar usuário root padrão
	authUseCase.InitializeRootUser()

	// Inicializa handlers
	appHandler = NewApplicationHandler(appUseCase, toggleUseCase, teamUseCase)
	toggleHandler = NewToggleHandler(toggleUseCase)
	authHandler = NewAuthHandler(authUseCase)
	userHandler = NewUserHandler(userUseCase)
	userManagementHandler = NewUserManagementHandler(userUseCase, teamUseCase)
	teamHandler = NewTeamHandler(teamUseCase)
	secretKeyHandler = NewSecretKeyHandler(secretKeyUseCase, toggleUseCase, appUseCase)
}

// Funções globais para as rotas
func CreateApplication(c *gin.Context) {
	appHandler.CreateApplication(c)
}

func GetAllApplications(c *gin.Context) {
	appHandler.GetAllApplications(c)
}

func GetApplication(c *gin.Context) {
	appHandler.GetApplication(c)
}

func UpdateApplication(c *gin.Context) {
	appHandler.UpdateApplication(c)
}

func DeleteApplication(c *gin.Context) {
	appHandler.DeleteApplication(c)
}

func CreateToggle(c *gin.Context) {
	toggleHandler.CreateToggle(c)
}

func GetAllToggles(c *gin.Context) {
	toggleHandler.GetAllToggles(c)
}

func GetToggleStatus(c *gin.Context) {
	toggleHandler.GetToggleStatus(c)
}

func UpdateToggle(c *gin.Context) {
	toggleHandler.UpdateToggle(c)
}

func DeleteToggle(c *gin.Context) {
	toggleHandler.DeleteToggle(c)
}

func UpdateEnabled(c *gin.Context) {
	toggleHandler.UpdateEnabled(c)
}

// Funções de autenticação
func Login(c *gin.Context) {
	authHandler.Login(c)
}

func Logout(c *gin.Context) {
	authHandler.Logout(c)
}

func CheckFirstAccess(c *gin.Context) {
	authHandler.CheckFirstAccess(c)
}

func ChangePasswordFirstTime(c *gin.Context) {
	authHandler.ChangePasswordFirstTime(c)
}

func ValidateToken() gin.HandlerFunc {
	return authHandler.ValidateToken()
}

func ValidatePasswordChangeAccess() gin.HandlerFunc {
	return authHandler.ValidatePasswordChangeAccess()
}

func RequireAdmin() gin.HandlerFunc {
	return authHandler.RequireAdmin()
}

func RequireRoot() gin.HandlerFunc {
	return authHandler.RequireRoot()
}

func RequireModifyPermission() gin.HandlerFunc {
	return authHandler.RequireModifyPermission()
}

func RequireAppAccess(permission entity.TeamPermissionLevel) gin.HandlerFunc {
	return RequireApplicationAccess(permission)
}

// Funções de secret keys
func GenerateSecretKey(c *gin.Context) {
	secretKeyHandler.GenerateSecretKey(c)
}

func GetTogglesBySecret(c *gin.Context) {
	secretKeyHandler.GetTogglesBySecret(c)
}

func GetSecretKeys(c *gin.Context) {
	secretKeyHandler.GetSecretKeys(c)
}

func DeleteSecretKey(c *gin.Context) {
	secretKeyHandler.DeleteSecretKey(c)
}

// Funções de gestão de usuários
func CreateUser(c *gin.Context) {
	userManagementHandler.CreateUser(c)
}

func ListUsers(c *gin.Context) {
	userManagementHandler.ListUsers(c)
}

func GetUser(c *gin.Context) {
	userManagementHandler.GetUser(c)
}

func UpdateUser(c *gin.Context) {
	userManagementHandler.UpdateUser(c)
}

func DeleteUser(c *gin.Context) {
	userManagementHandler.DeleteUser(c)
}

func ChangePassword(c *gin.Context) {
	userManagementHandler.ChangePassword(c)
}

func GetCurrentUser(c *gin.Context) {
	userManagementHandler.GetCurrentUser(c)
}

// Funções de gestão de times
func CreateTeam(c *gin.Context) {
	teamHandler.CreateTeam(c)
}

func GetAllTeams(c *gin.Context) {
	teamHandler.GetAllTeams(c)
}

func GetTeam(c *gin.Context) {
	teamHandler.GetTeam(c)
}

func UpdateTeam(c *gin.Context) {
	teamHandler.UpdateTeam(c)
}

func DeleteTeam(c *gin.Context) {
	teamHandler.DeleteTeam(c)
}

func AddUserToTeam(c *gin.Context) {
	teamHandler.AddUserToTeam(c)
}

func RemoveUserFromTeam(c *gin.Context) {
	teamHandler.RemoveUserFromTeam(c)
}

func GetTeamUsers(c *gin.Context) {
	teamHandler.GetTeamUsers(c)
}

func AddApplicationToTeam(c *gin.Context) {
	teamHandler.AddApplicationToTeam(c)
}

func RemoveApplicationFromTeam(c *gin.Context) {
	teamHandler.RemoveApplicationFromTeam(c)
}

func UpdateApplicationPermission(c *gin.Context) {
	teamHandler.UpdateApplicationPermission(c)
}

func GetTeamApplications(c *gin.Context) {
	teamHandler.GetTeamApplications(c)
}

func GetUserTeams(c *gin.Context) {
	teamHandler.GetUserTeams(c)
}
