package handler

import (
	"github.com/gin-gonic/gin"
	"github.com/manorfm/totoogle/internal/app/domain/auth"
	"github.com/manorfm/totoogle/internal/app/infrastructure/database"
	"github.com/manorfm/totoogle/internal/app/usecase"
	"gorm.io/gorm"
)

var (
	appHandler       *ApplicationHandler
	toggleHandler    *ToggleHandler
	authHandler      *AuthHandler
	userHandler      *UserHandler
	secretKeyHandler *SecretKeyHandler
)

// InitHandlers inicializa os handlers
func InitHandlers(db *gorm.DB) {
	// Inicializa repositórios
	appRepo := database.NewApplicationRepository(db)
	toggleRepo := database.NewToggleRepository(db)
	userRepo := database.NewUserRepository(db)
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
	secretKeyUseCase := usecase.NewSecretKeyUseCase(secretKeyRepo)

	// Inicializar usuário admin padrão
	authUseCase.InitializeDefaultAdmin()

	// Inicializa handlers
	appHandler = NewApplicationHandler(appUseCase, toggleUseCase)
	toggleHandler = NewToggleHandler(toggleUseCase)
	authHandler = NewAuthHandler(authUseCase)
	userHandler = NewUserHandler(userUseCase)
	secretKeyHandler = NewSecretKeyHandler(secretKeyUseCase, toggleUseCase)
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

func ValidateToken() gin.HandlerFunc {
	return authHandler.ValidateToken()
}

func RequireAdmin() gin.HandlerFunc {
	return authHandler.RequireAdmin()
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
