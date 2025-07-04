package handler

import (
	"github.com/gin-gonic/gin"
	"github.com/manorfm/totoogle/internal/app/infrastructure/database"
	"github.com/manorfm/totoogle/internal/app/usecase"
	"gorm.io/gorm"
)

var (
	appHandler    *ApplicationHandler
	toggleHandler *ToggleHandler
)

// InitHandlers inicializa os handlers
func InitHandlers(db *gorm.DB) {
	// Inicializa repositórios
	appRepo := database.NewApplicationRepository(db)
	toggleRepo := database.NewToggleRepository(db)

	// Inicializa use cases
	appUseCase := usecase.NewApplicationUseCase(appRepo)
	toggleUseCase := usecase.NewToggleUseCase(toggleRepo, appRepo)

	// Inicializa handlers
	appHandler = NewApplicationHandler(appUseCase, toggleUseCase)
	toggleHandler = NewToggleHandler(toggleUseCase)
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
