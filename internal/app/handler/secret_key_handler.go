package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/usecase"
)

type SecretKeyHandler struct {
	secretKeyUseCase    *usecase.SecretKeyUseCase
	toggleUseCase       *usecase.ToggleUseCase
	applicationUseCase  *usecase.ApplicationUseCase
}

func NewSecretKeyHandler(secretKeyUseCase *usecase.SecretKeyUseCase, toggleUseCase *usecase.ToggleUseCase, applicationUseCase *usecase.ApplicationUseCase) *SecretKeyHandler {
	return &SecretKeyHandler{
		secretKeyUseCase:   secretKeyUseCase,
		toggleUseCase:      toggleUseCase,
		applicationUseCase: applicationUseCase,
	}
}

// GenerateSecretKeyRequest representa o request para gerar uma secret key
type GenerateSecretKeyRequest struct {
	Name string `json:"name,omitempty"`
}

// GenerateSecretKey gera uma nova secret key para uma aplicação
// POST /api/applications/{application_id}/generate-secret
func (h *SecretKeyHandler) GenerateSecretKey(c *gin.Context) {
	applicationID := c.Param("id")
	if applicationID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Application ID is required",
		})
		return
	}

	// Obter usuário do contexto (setado pelo middleware de autenticação)
	userInterface, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User not found in context",
		})
		return
	}

	user, ok := userInterface.(*entity.User)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Invalid user data in context",
		})
		return
	}

	userID := user.ID

	// Regenerar a secret key (invalida as anteriores)
	response, err := h.secretKeyUseCase.RegenerateSecretKey(applicationID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to generate secret key: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":     true,
		"secret_key":  response.SecretKey,
		"plain_key":   response.PlainTextKey,
		"warning":     "This key will only be shown once. Please store it securely.",
	})
}

// GetTogglessBySecret retorna todos os toggles de uma aplicação usando secret key
// GET /api/toggles/by-secret/{secret_key}
func (h *SecretKeyHandler) GetTogglesBySecret(c *gin.Context) {
	secretKey := c.Param("secret")
	if secretKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Secret key is required",
		})
		return
	}

	// Validar a secret key
	key, err := h.secretKeyUseCase.ValidateSecretKey(secretKey)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Invalid or expired secret key",
		})
		return
	}

	// Buscar dados da aplicação
	application, err := h.applicationUseCase.GetApplicationByID(key.ApplicationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to retrieve application: " + err.Error(),
		})
		return
	}

	// Buscar todos os toggles da aplicação
	toggles, err := h.toggleUseCase.GetAllTogglesByApp(key.ApplicationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to retrieve toggles: " + err.Error(),
		})
		return
	}

	// Simplificar toggles removendo children e parent
	simplifiedToggles := make([]gin.H, 0, len(toggles))
	for _, toggle := range toggles {
		simplifiedToggle := gin.H{
			"id":                toggle.ID,
			"value":             toggle.Value,
			"enabled":           toggle.Enabled,
			"path":              toggle.Path,
			"level":             toggle.Level,
			"parent_id":         toggle.ParentID,
			"app_id":            toggle.AppID,
			"has_activation_rule": toggle.HasActivationRule,
			"activation_rule":   toggle.ActivationRule,
		}
		simplifiedToggles = append(simplifiedToggles, simplifiedToggle)
	}

	c.JSON(http.StatusOK, gin.H{
		"application": gin.H{
			"id":      application.ID,
			"name":    application.Name,
			"toggles": simplifiedToggles,
		},
	})
}

// GetSecretKeys retorna todas as secret keys de uma aplicação
// GET /api/applications/{application_id}/secret-keys
func (h *SecretKeyHandler) GetSecretKeys(c *gin.Context) {
	applicationID := c.Param("id")
	if applicationID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Application ID is required",
		})
		return
	}

	secretKeys, err := h.secretKeyUseCase.GetSecretKeysByApplicationID(applicationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to retrieve secret keys: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":     true,
		"secret_keys": secretKeys,
	})
}

// DeleteSecretKey remove uma secret key
// DELETE /api/secret-keys/{secret_key_id}
func (h *SecretKeyHandler) DeleteSecretKey(c *gin.Context) {
	secretKeyID := c.Param("id")
	if secretKeyID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Secret key ID is required",
		})
		return
	}

	err := h.secretKeyUseCase.DeleteSecretKey(secretKeyID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to delete secret key: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Secret key deleted successfully",
	})
}