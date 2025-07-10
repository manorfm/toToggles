package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/usecase"
)

// ToggleHandler gerencia as requisições HTTP para toggles
type ToggleHandler struct {
	toggleUseCase *usecase.ToggleUseCase
}

// NewToggleHandler cria uma nova instância de ToggleHandler
func NewToggleHandler(toggleUseCase *usecase.ToggleUseCase) *ToggleHandler {
	return &ToggleHandler{
		toggleUseCase: toggleUseCase,
	}
}

// CreateToggleRequest representa a requisição para criar um toggle
type CreateToggleRequest struct {
	Toggle string `json:"toggle" binding:"required"`
}

// UpdateToggleRequest representa a requisição para atualizar um toggle
type UpdateToggleRequest struct {
	Enabled bool `json:"enabled"`
}

// ToggleStatusResponse representa a resposta do status de um toggle
type ToggleStatusResponse struct {
	Path    string `json:"path"`
	Enabled bool   `json:"enabled"`
}

// UpdateEnabledRequest representa a requisição para atualizar enabled
type UpdateEnabledRequest struct {
	Enabled bool `json:"enabled"`
}

// CreateToggle cria um novo toggle
func (h *ToggleHandler) CreateToggle(c *gin.Context) {
	appID := c.Param("id")
	if appID == "" {
		appErr := entity.NewAppError(entity.ErrCodeValidation, "validation failed")
		appErr.AddDetail("appID", "Application ID is required")
		c.JSON(http.StatusBadRequest, appErr)
		return
	}

	// Validar Application ID
	appValidation := entity.ValidateApplicationID(appID)
	if !appValidation.IsValid {
		c.JSON(http.StatusBadRequest, appValidation.ToAppError())
		return
	}

	var req CreateToggleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		appErr := entity.NewAppError(entity.ErrCodeValidation, "validation failed")
		appErr.AddDetail("request", "Invalid request body")
		c.JSON(http.StatusBadRequest, appErr)
		return
	}

	// Validar toggle path
	toggleValidation := entity.ValidateTogglePath(req.Toggle)
	if !toggleValidation.IsValid {
		c.JSON(http.StatusBadRequest, toggleValidation.ToAppError())
		return
	}

	err := h.toggleUseCase.CreateToggle(req.Toggle, true, true, appID)
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

	c.JSON(http.StatusCreated, gin.H{
		"message": "toggle created successfully",
		"path":    req.Toggle,
		"enabled": true,
	})
}

// GetToggleStatus busca o status de um toggle por ID
func (h *ToggleHandler) GetToggleStatus(c *gin.Context) {
	appID := c.Param("id")
	toggleID := c.Param("toggleId")
	if appID == "" || toggleID == "" {
		appErr := entity.NewAppError(entity.ErrCodeValidation, "validation failed")
		if appID == "" {
			appErr.AddDetail("appID", "Application ID is required")
		}
		if toggleID == "" {
			appErr.AddDetail("toggleID", "Toggle ID is required")
		}
		c.JSON(http.StatusBadRequest, appErr)
		return
	}

	// Validar IDs
	appValidation := entity.ValidateApplicationID(appID)
	toggleValidation := entity.ValidateToggleID(toggleID)

	if !appValidation.IsValid || !toggleValidation.IsValid {
		// Combinar erros de validação
		combinedErrors := entity.NewAppError(entity.ErrCodeValidation, "validation failed")
		for _, err := range appValidation.Errors {
			combinedErrors.AddDetail(err.Field, err.Message)
		}
		for _, err := range toggleValidation.Errors {
			combinedErrors.AddDetail(err.Field, err.Message)
		}
		c.JSON(http.StatusBadRequest, combinedErrors)
		return
	}

	toggle, err := h.toggleUseCase.GetToggleByID(toggleID, appID)
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

	c.JSON(http.StatusOK, toggle)
}

// UpdateToggle atualiza um toggle por ID
func (h *ToggleHandler) UpdateToggle(c *gin.Context) {
	appID := c.Param("id")
	toggleID := c.Param("toggleId")
	if appID == "" || toggleID == "" {
		appErr := entity.NewAppError(entity.ErrCodeValidation, "validation failed")
		if appID == "" {
			appErr.AddDetail("appID", "Application ID is required")
		}
		if toggleID == "" {
			appErr.AddDetail("toggleID", "Toggle ID is required")
		}
		c.JSON(http.StatusBadRequest, appErr)
		return
	}

	var req struct {
		Enabled *bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Enabled == nil {
		appErr := entity.NewAppError(entity.ErrCodeValidation, "validation failed")
		appErr.AddDetail("enabled", "Enabled field is required")
		c.JSON(http.StatusBadRequest, appErr)
		return
	}

	err := h.toggleUseCase.UpdateToggleByID(toggleID, *req.Enabled, appID)
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

	c.JSON(http.StatusOK, gin.H{"message": "toggle updated successfully"})
}

// DeleteToggle remove um toggle por ID
func (h *ToggleHandler) DeleteToggle(c *gin.Context) {
	appID := c.Param("id")
	toggleID := c.Param("toggleId")
	if appID == "" || toggleID == "" {
		appErr := entity.NewAppError(entity.ErrCodeValidation, "validation failed")
		if appID == "" {
			appErr.AddDetail("appID", "Application ID is required")
		}
		if toggleID == "" {
			appErr.AddDetail("toggleID", "Toggle ID is required")
		}
		c.JSON(http.StatusBadRequest, appErr)
		return
	}

	err := h.toggleUseCase.DeleteToggleByID(toggleID, appID)
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
		"message": "toggle deleted successfully",
		"id":      toggleID,
	})
}

// GetAllToggles busca todos os toggles de uma aplicação
func (h *ToggleHandler) GetAllToggles(c *gin.Context) {
	appID := c.Param("id")
	if appID == "" {
		appErr := entity.NewAppError(entity.ErrCodeValidation, "validation failed")
		appErr.AddDetail("appID", "Application ID is required")
		c.JSON(http.StatusBadRequest, appErr)
		return
	}

	// Verifica se quer a hierarquia ou lista simples
	hierarchy := c.Query("hierarchy") == "true"

	if hierarchy {
		hierarchyArr, err := h.toggleUseCase.GetToggleHierarchy(appID)
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
			"application": appID,
			"toggles":     hierarchyArr,
		})
		return
	}

	toggles, err := h.toggleUseCase.GetAllTogglesByApp(appID)
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

	c.JSON(http.StatusOK, toggles)
}

// UpdateEnabled atualiza o campo enabled de um toggle e seus descendentes
func (h *ToggleHandler) UpdateEnabled(c *gin.Context) {
	appID := c.Param("id")
	toggleID := c.Param("toggleId")
	if appID == "" || toggleID == "" {
		appErr := entity.NewAppError(entity.ErrCodeValidation, "validation failed")
		if appID == "" {
			appErr.AddDetail("appID", "Application ID is required")
		}
		if toggleID == "" {
			appErr.AddDetail("toggleID", "Toggle ID is required")
		}
		c.JSON(http.StatusBadRequest, appErr)
		return
	}

	var req UpdateEnabledRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		appErr := entity.NewAppError(entity.ErrCodeValidation, "validation failed")
		appErr.AddDetail("request", "Invalid request body")
		c.JSON(http.StatusBadRequest, appErr)
		return
	}

	err := h.toggleUseCase.UpdateEnabledRecursively(toggleID, req.Enabled, appID)
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

	c.JSON(http.StatusOK, gin.H{"message": "toggle enabled updated successfully"})
}
