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
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    entity.ErrCodeValidation,
			"message": "invalid request body: " + err.Error(),
		})
		return
	}

	app, err := h.appUseCase.CreateApplication(req.Name)
	if err != nil {
		appErr, ok := err.(*entity.AppError)
		if ok {
			c.JSON(http.StatusBadRequest, gin.H{
				"code":    appErr.Code,
				"message": appErr.Message,
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    entity.ErrCodeInternal,
			"message": "internal server error",
		})
		return
	}

	c.JSON(http.StatusCreated, app)
}

// GetApplication busca uma aplicação por ID
func (h *ApplicationHandler) GetApplication(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    entity.ErrCodeValidation,
			"message": "application ID is required",
		})
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
			c.JSON(status, gin.H{
				"code":    appErr.Code,
				"message": appErr.Message,
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    entity.ErrCodeInternal,
			"message": "internal server error",
		})
		return
	}

	c.JSON(http.StatusOK, app)
}

// GetAllApplications busca todas as aplicações
func (h *ApplicationHandler) GetAllApplications(c *gin.Context) {
	apps, err := h.appUseCase.GetAllApplications()
	if err != nil {
		appErr, ok := err.(*entity.AppError)
		if ok {
			c.JSON(http.StatusBadRequest, gin.H{
				"code":    appErr.Code,
				"message": appErr.Message,
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    entity.ErrCodeInternal,
			"message": "internal server error",
		})
		return
	}

	// Buscar contagem de toggles para cada aplicação
	toggleUseCase := h.toggleUseCase // Precisa garantir que o handler tem acesso ao ToggleUseCase
	var result []gin.H
	for _, app := range apps {
		toggles, _ := toggleUseCase.GetAllTogglesByApp(app.ID)
		total := len(toggles)
		enabled := 0
		disabled := 0
		for _, t := range toggles {
			if t.Enabled {
				enabled++
			} else {
				disabled++
			}
		}
		result = append(result, gin.H{
			"id":               app.ID,
			"name":             app.Name,
			"created_at":       app.CreatedAt,
			"updated_at":       app.UpdatedAt,
			"toggles_total":    total,
			"toggles_enabled":  enabled,
			"toggles_disabled": disabled,
		})
	}

	c.JSON(http.StatusOK, result)
}

// UpdateApplication atualiza uma aplicação
func (h *ApplicationHandler) UpdateApplication(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    entity.ErrCodeValidation,
			"message": "application ID is required",
		})
		return
	}

	var req UpdateApplicationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    entity.ErrCodeValidation,
			"message": "invalid request body: " + err.Error(),
		})
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
			c.JSON(status, gin.H{
				"code":    appErr.Code,
				"message": appErr.Message,
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    entity.ErrCodeInternal,
			"message": "internal server error",
		})
		return
	}

	c.JSON(http.StatusOK, app)
}

// DeleteApplication remove uma aplicação
func (h *ApplicationHandler) DeleteApplication(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    entity.ErrCodeValidation,
			"message": "application ID is required",
		})
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
			c.JSON(status, gin.H{
				"code":    appErr.Code,
				"message": appErr.Message,
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    entity.ErrCodeInternal,
			"message": "internal server error",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "application deleted successfully",
	})
}
