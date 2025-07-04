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
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    entity.ErrCodeValidation,
			"message": "application ID is required",
		})
		return
	}

	var req CreateToggleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    entity.ErrCodeValidation,
			"message": "invalid request body: " + err.Error(),
		})
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

	c.JSON(http.StatusCreated, gin.H{
		"message": "toggle created successfully",
		"path":    req.Toggle,
		"enabled": true,
	})
}

// GetToggleStatus verifica se um toggle está habilitado
func (h *ToggleHandler) GetToggleStatus(c *gin.Context) {
	appID := c.Param("id")
	if appID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    entity.ErrCodeValidation,
			"message": "application ID is required",
		})
		return
	}

	path := c.Query("path")
	if path == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    entity.ErrCodeValidation,
			"message": "toggle path is required",
		})
		return
	}

	enabled, err := h.toggleUseCase.GetToggleStatus(path, appID)
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

	c.JSON(http.StatusOK, ToggleStatusResponse{
		Path:    path,
		Enabled: enabled,
	})
}

// UpdateToggle atualiza um toggle
func (h *ToggleHandler) UpdateToggle(c *gin.Context) {
	appID := c.Param("id")
	if appID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    entity.ErrCodeValidation,
			"message": "application ID is required",
		})
		return
	}

	path := c.Query("path")
	if path == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    entity.ErrCodeValidation,
			"message": "toggle path is required",
		})
		return
	}

	var req UpdateToggleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    entity.ErrCodeValidation,
			"message": "invalid request body: " + err.Error(),
		})
		return
	}

	err := h.toggleUseCase.UpdateToggle(path, req.Enabled, appID)
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
		"message": "toggle updated successfully",
		"path":    path,
		"enabled": req.Enabled,
	})
}

// DeleteToggle remove um toggle
func (h *ToggleHandler) DeleteToggle(c *gin.Context) {
	appID := c.Param("id")
	if appID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    entity.ErrCodeValidation,
			"message": "application ID is required",
		})
		return
	}

	path := c.Query("path")
	if path == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    entity.ErrCodeValidation,
			"message": "toggle path is required",
		})
		return
	}

	err := h.toggleUseCase.DeleteToggle(path, appID)
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
		"message": "toggle deleted successfully",
		"path":    path,
	})
}

// GetAllToggles busca todos os toggles de uma aplicação
func (h *ToggleHandler) GetAllToggles(c *gin.Context) {
	appID := c.Param("id")
	if appID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    entity.ErrCodeValidation,
			"message": "application ID is required",
		})
		return
	}

	// Verifica se quer a hierarquia ou lista simples
	hierarchy := c.Query("hierarchy") == "true"

	if hierarchy {
		hierarchyMap, err := h.toggleUseCase.GetToggleHierarchy(appID)
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
			"application": appID,
			"toggles":     hierarchyMap,
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

	c.JSON(http.StatusOK, toggles)
}

// UpdateEnabled atualiza o campo enabled de um toggle e seus descendentes
func (h *ToggleHandler) UpdateEnabled(c *gin.Context) {
	appID := c.Param("id")
	toggleID := c.Param("toggleId")
	if appID == "" || toggleID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "application ID and toggle ID are required"})
		return
	}
	var req UpdateEnabledRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid request body: " + err.Error()})
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
			c.JSON(status, gin.H{"code": appErr.Code, "message": appErr.Message})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"code": entity.ErrCodeInternal, "message": "internal server error"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "toggle enabled updated successfully"})
}
