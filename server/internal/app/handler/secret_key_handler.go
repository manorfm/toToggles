package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/middleware"
	"github.com/manorfm/totoogle/internal/app/usecase"
)

type SecretKeyHandler struct {
	secretKeyUseCase    *usecase.SecretKeyUseCase
	toggleUseCase       *usecase.ToggleUseCase
	applicationUseCase  *usecase.ApplicationUseCase
	auditUseCase        *usecase.AuditUseCase
}

// auditUseCase: sem cobertura pro kill switch (DisableToggleBySecret) de propósito — essa rota
// autentica por secret key, não por sessão (docs/rest-flow.md), então não existe um
// entity.User pra ser o actor; Record já ignora actor nil, então cobrir isso exigiria inventar
// um ator sintético "a secret key", fora do escopo combinado (auditoria de ações de usuário).
func NewSecretKeyHandler(secretKeyUseCase *usecase.SecretKeyUseCase, toggleUseCase *usecase.ToggleUseCase, applicationUseCase *usecase.ApplicationUseCase, auditUseCase *usecase.AuditUseCase) *SecretKeyHandler {
	return &SecretKeyHandler{
		secretKeyUseCase:   secretKeyUseCase,
		toggleUseCase:      toggleUseCase,
		applicationUseCase: applicationUseCase,
		auditUseCase:       auditUseCase,
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

	// Existência checada ANTES de regenerar só pra saber se isto é a primeira chave da
	// aplicação ou uma rotação — RegenerateSecretKey sempre apaga a(s) anterior(es) antes de
	// criar, então checar depois já seria tarde demais.
	existingKeys, _ := h.secretKeyUseCase.GetSecretKeysByApplicationID(applicationID)
	rotated := len(existingKeys) > 0

	// Regenerar a secret key (invalida as anteriores)
	response, err := h.secretKeyUseCase.RegenerateSecretKey(applicationID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to generate secret key: " + err.Error(),
		})
		return
	}

	// Confirmado no protótipo real (app.jsx#doGenerateKey): "Rotated service key" quando já
	// existia uma chave, "Generated service key" na primeira vez — nunca sempre "Generated".
	keyEventText := "Generated service key"
	if rotated {
		keyEventText = "Rotated service key"
	}
	h.auditUseCase.RecordForApplication(entity.AuditEventKeyGenerated, keyEventText, "", applicationID, user)

	c.JSON(http.StatusOK, gin.H{
		"success":     true,
		"secret_key":  response.SecretKey,
		"plain_key":   response.PlainTextKey,
		"warning":     "This key will only be shown once. Please store it securely.",
	})
}

// GetTogglessBySecret retorna todos os toggles de uma aplicação usando secret key
// GET /api/toggles - Header: X-API-Key
func (h *SecretKeyHandler) GetTogglesBySecret(c *gin.Context) {
	secretKey := c.GetHeader("X-API-Key")
	if secretKey == "" {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "X-API-Key header is required",
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

// DisableToggleRequest representa o request do kill switch
type DisableToggleRequest struct {
	Path string `json:"path" binding:"required"`
}

// DisableToggleBySecret desliga um único toggle, identificado por path, dentro da aplicação da
// secret key apresentada — "kill switch" de escopo mínimo pra uso por sistemas externos de
// alerta/monitoramento: só desliga (nunca liga, nunca lê nada além do necessário pra validar a
// chave, nunca mexe em regra de ativação). Reaproveita a mesma secret key da leitura pública
// (GET /api/toggles) — não introduz um tipo de credencial novo. Idempotente: desligar um toggle
// já desligado continua devolvendo 200. Sem middleware de sessão/approval nesta rota de
// propósito — ver docs/rest-flow.md.
// POST /api/toggles/disable - Header: X-API-Key
func (h *SecretKeyHandler) DisableToggleBySecret(c *gin.Context) {
	secretKey := c.GetHeader("X-API-Key")
	if secretKey == "" {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "X-API-Key header is required",
		})
		return
	}

	key, err := h.secretKeyUseCase.ValidateSecretKey(secretKey)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Invalid or expired secret key",
		})
		return
	}

	if !middleware.AllowKillSwitchRequest(key.ID) {
		c.JSON(http.StatusTooManyRequests, gin.H{
			"error": "Too many kill-switch requests for this secret key. Try again later.",
		})
		return
	}

	var req DisableToggleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "path is required",
		})
		return
	}

	if err := h.toggleUseCase.UpdateToggle(req.Path, false, key.ApplicationID); err != nil {
		if appErr, ok := err.(*entity.AppError); ok && appErr.Code == entity.ErrCodeNotFound {
			c.JSON(http.StatusNotFound, gin.H{
				"error": "Toggle not found",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to disable toggle: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"path":    req.Path,
		"enabled": false,
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

	// applicationID só existe pra montar o evento de auditoria (o delete em si não devolve a
	// chave apagada) — buscado antes da exclusão, de propósito.
	var applicationID string
	if key, err := h.secretKeyUseCase.GetSecretKeyByID(secretKeyID); err == nil {
		applicationID = key.ApplicationID
	}

	err := h.secretKeyUseCase.DeleteSecretKey(secretKeyID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to delete secret key: " + err.Error(),
		})
		return
	}

	h.auditUseCase.RecordForApplication(entity.AuditEventKeyRevoked, "Service key revoked", "", applicationID, auditActor(c))

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Secret key deleted successfully",
	})
}