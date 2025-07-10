package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/usecase"
)

// ApplicationHandler gerencia as requisições HTTP para aplicações
type ApplicationHandler struct {
	appUseCase    *usecase.ApplicationUseCase
	toggleUseCase *usecase.ToggleUseCase
}

// NewApplicationHandler cria uma nova instância de ApplicationHandler
func NewApplicationHandler(appUseCase *usecase.ApplicationUseCase, toggleUseCase *usecase.ToggleUseCase) *ApplicationHandler {
	return &ApplicationHandler{
		appUseCase:    appUseCase,
		toggleUseCase: toggleUseCase,
	}
}

// CreateApplicationRequest representa a requisição para criar uma aplicação
type CreateApplicationRequest struct {
	Name string `json:"name" binding:"required"`
}

// UpdateApplicationRequest representa a requisição para atualizar uma aplicação
type UpdateApplicationRequest struct {
	Name string `json:"name" binding:"required"`
}

// CreateApplication cria uma nova aplicação
func (h *ApplicationHandler) CreateApplication(c *gin.Context) {
	var req CreateApplicationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		appErr := entity.NewAppError(entity.ErrCodeValidation, "validation failed")
		appErr.AddDetail("request", "Invalid request body")
		c.JSON(http.StatusBadRequest, appErr)
		return
	}

	// Validar input
	validation := entity.ValidateApplicationName(req.Name)
	if !validation.IsValid {
		c.JSON(http.StatusBadRequest, validation.ToAppError())
		return
	}

	app, err := h.appUseCase.CreateApplication(req.Name)
	if err != nil {
		appErr, ok := err.(*entity.AppError)
		if ok {
			status := http.StatusBadRequest
			if appErr.Code == entity.ErrCodeAlreadyExists {
				status = http.StatusConflict
			}
			c.JSON(status, appErr)
			return
		}
		c.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, "internal server error"))
		return
	}

	c.JSON(http.StatusCreated, app)
}

// GetApplication busca uma aplicação por ID
func (h *ApplicationHandler) GetApplication(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		appErr := entity.NewAppError(entity.ErrCodeValidation, "validation failed")
		appErr.AddDetail("id", "Application ID is required")
		c.JSON(http.StatusBadRequest, appErr)
		return
	}

	// Validar ID
	validation := entity.ValidateApplicationID(id)
	if !validation.IsValid {
		c.JSON(http.StatusBadRequest, validation.ToAppError())
		return
	}

	app, err := h.appUseCase.GetApplicationByID(id)
	if err != nil {
		appErr, ok := err.(*entity.AppError)
		if ok {
			status := http.StatusBadRequest
			if appErr.Code == entity.ErrCodeNotFound {
				status = http.StatusNotFound
			}
			c.JSON(status, appErr)
			return
		}
		c.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, "internal server error"))
		return
	}

	c.JSON(http.StatusOK, app)
}

// GetAllApplications busca todas as aplicações
func (h *ApplicationHandler) GetAllApplications(c *gin.Context) {
	// Usar a query otimizada que inclui contagem de toggles
	apps, err := h.appUseCase.GetAllApplicationsWithCounts()
	if err != nil {
		appErr, ok := err.(*entity.AppError)
		if ok {
			c.JSON(http.StatusBadRequest, appErr)
			return
		}
		c.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, "internal server error"))
		return
	}

	c.JSON(http.StatusOK, apps)
}

// UpdateApplication atualiza uma aplicação
func (h *ApplicationHandler) UpdateApplication(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		appErr := entity.NewAppError(entity.ErrCodeValidation, "validation failed")
		appErr.AddDetail("id", "Application ID is required")
		c.JSON(http.StatusBadRequest, appErr)
		return
	}

	var req UpdateApplicationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		appErr := entity.NewAppError(entity.ErrCodeValidation, "validation failed")
		appErr.AddDetail("request", "Invalid request body")
		c.JSON(http.StatusBadRequest, appErr)
		return
	}

	app, err := h.appUseCase.UpdateApplication(id, req.Name)
	if err != nil {
		appErr, ok := err.(*entity.AppError)
		if ok {
			status := http.StatusBadRequest
			if appErr.Code == entity.ErrCodeNotFound {
				status = http.StatusNotFound
			}
			c.JSON(status, appErr)
			return
		}
		c.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, "internal server error"))
		return
	}

	c.JSON(http.StatusOK, app)
}

// DeleteApplication remove uma aplicação
func (h *ApplicationHandler) DeleteApplication(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		appErr := entity.NewAppError(entity.ErrCodeValidation, "validation failed")
		appErr.AddDetail("id", "Application ID is required")
		c.JSON(http.StatusBadRequest, appErr)
		return
	}

	err := h.appUseCase.DeleteApplication(id)
	if err != nil {
		appErr, ok := err.(*entity.AppError)
		if ok {
			status := http.StatusBadRequest
			if appErr.Code == entity.ErrCodeNotFound {
				status = http.StatusNotFound
			}
			c.JSON(status, appErr)
			return
		}
		c.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, "internal server error"))
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "application deleted successfully",
	})
}
