package handler

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"sort"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/middleware"
	"github.com/manorfm/totoogle/internal/app/usecase"
)

type SecretKeyHandler struct {
	secretKeyUseCase   *usecase.SecretKeyUseCase
	toggleUseCase      *usecase.ToggleUseCase
	applicationUseCase *usecase.ApplicationUseCase
	auditUseCase       *usecase.AuditUseCase
}

// publicToggle is the deliberately narrow representation exposed to SDKs. Keeping it separate
// from entity.Toggle prevents persistence-only fields from accidentally becoming public API and
// gives the catalogue revision one canonical input.
type publicToggle struct {
	ID                string                 `json:"id"`
	Value             string                 `json:"value"`
	Enabled           bool                   `json:"enabled"`
	Path              string                 `json:"path"`
	Level             int                    `json:"level"`
	ParentID          *string                `json:"parent_id"`
	AppID             string                 `json:"app_id"`
	HasActivationRule bool                   `json:"has_activation_rule"`
	ActivationRule    *entity.ActivationRule `json:"activation_rule"`
}

type publicCatalogueApplication struct {
	ID       string         `json:"id"`
	Name     string         `json:"name"`
	Revision string         `json:"revision"`
	Toggles  []publicToggle `json:"toggles"`
}

type publicCatalogueResponse struct {
	Application publicCatalogueApplication `json:"application"`
}

// catalogueRevision is a content hash, not a database version. It changes precisely with the
// authenticated caller's visible catalogue and never depends on key material, timestamps, or
// incidental query ordering.
func catalogueRevision(applicationID, applicationName string, toggles []publicToggle) (string, error) {
	canonical := struct {
		ApplicationID   string         `json:"application_id"`
		ApplicationName string         `json:"application_name"`
		Toggles         []publicToggle `json:"toggles"`
	}{applicationID, applicationName, toggles}
	payload, err := json.Marshal(canonical)
	if err != nil {
		return "", err
	}
	digest := sha256.Sum256(payload)
	return hex.EncodeToString(digest[:]), nil
}

func simplifyCatalogueToggles(toggles []*entity.Toggle) []publicToggle {
	simplified := make([]publicToggle, 0, len(toggles))
	for _, toggle := range toggles {
		rule := toggle.ActivationRule
		if !toggle.HasActivationRule {
			rule = nil
		}
		simplified = append(simplified, publicToggle{
			ID:                toggle.ID,
			Value:             toggle.Value,
			Enabled:           toggle.Enabled,
			Path:              toggle.Path,
			Level:             toggle.Level,
			ParentID:          toggle.ParentID,
			AppID:             toggle.AppID,
			HasActivationRule: toggle.HasActivationRule,
			ActivationRule:    rule,
		})
	}
	// GetHierarchyByAppID orders for UI rendering, but level/value is not a total order. A stable
	// total order makes the JSON and its hash deterministic even for identical leaf values.
	sort.Slice(simplified, func(i, j int) bool {
		if simplified[i].Path == simplified[j].Path {
			return simplified[i].ID < simplified[j].ID
		}
		return simplified[i].Path < simplified[j].Path
	})
	return simplified
}

// ifNoneMatchMatches implements weak entity-tag comparison, which is the comparison required by
// If-None-Match for GET. It accepts a correctly quoted tag, an optional W/ prefix, or a list.
func ifNoneMatchMatches(header, currentETag string) bool {
	header = strings.TrimSpace(header)
	if header == "*" {
		return true
	}
	for len(header) > 0 {
		header = strings.TrimLeft(header, " \t")
		if strings.HasPrefix(header, "W/") {
			header = header[2:]
		}
		if len(header) == 0 || header[0] != '"' {
			return false
		}
		end := 1
		for end < len(header) {
			if header[end] == '\\' && end+1 < len(header) {
				end += 2
				continue
			}
			if header[end] == '"' {
				break
			}
			end++
		}
		if end == len(header) {
			return false
		}
		if header[:end+1] == currentETag {
			return true
		}
		header = strings.TrimLeft(header[end+1:], " \t")
		if header == "" {
			return false
		}
		if header[0] != ',' {
			return false
		}
		header = header[1:]
	}
	return false
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
	// target é o nome da aplicação — confirmado no protótipo real (AUDIT_SEED au4: target
	// "Checkout Service"); erro na busca (improvável, a chave acabou de ser gerada pra essa
	// aplicação) só resulta num target vazio, nunca trava a resposta principal.
	appName := ""
	if app, err := h.applicationUseCase.GetApplicationByID(applicationID); err == nil {
		appName = app.Name
	}
	h.auditUseCase.RecordForApplication(entity.AuditEventKeyGenerated, keyEventText, appName, applicationID, user)

	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"secret_key": response.SecretKey,
		"plain_key":  response.PlainTextKey,
		"warning":    "This key will only be shown once. Please store it securely.",
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

	simplifiedToggles := simplifyCatalogueToggles(toggles)
	revision, err := catalogueRevision(application.ID, application.Name, simplifiedToggles)
	if err != nil {
		// An invalid persisted rule config must not produce a partial catalogue or disclose
		// internals. This should be unreachable through validated write APIs.
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to build toggle catalogue"})
		return
	}

	response := publicCatalogueResponse{Application: publicCatalogueApplication{
		ID:       application.ID,
		Name:     application.Name,
		Revision: revision,
		Toggles:  simplifiedToggles,
	}}
	etag := `"` + revision + `"`
	c.Header("ETag", etag)

	// Authentication intentionally precedes this check: an unauthenticated request must never
	// use a known ETag as an oracle for another application's catalogue.
	for _, ifNoneMatch := range c.Request.Header.Values("If-None-Match") {
		if ifNoneMatchMatches(ifNoneMatch, etag) {
			c.Status(http.StatusNotModified)
			return
		}
	}

	c.JSON(http.StatusOK, response)
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

// DeleteSecretKey revoga uma secret key (current ou previous — v2.6 §5.1) — o registro continua
// no banco (histórico), só passa a não autenticar mais nada e sumir da listagem. O caller decide
// QUAL chave revogar passando o ID certo (o de "current" ou o de "previous", ambos vêm de
// GET .../secret-keys); não há distinção de rota entre os dois casos.
// DELETE /api/secret-keys/{secret_key_id}
func (h *SecretKeyHandler) DeleteSecretKey(c *gin.Context) {
	secretKeyID := c.Param("id")
	if secretKeyID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Secret key ID is required",
		})
		return
	}

	// applicationID só existe pra montar o evento de auditoria (revogar não devolve a chave em
	// si) — buscado antes, de propósito.
	var applicationID string
	if key, err := h.secretKeyUseCase.GetSecretKeyByID(secretKeyID); err == nil {
		applicationID = key.ApplicationID
	}

	err := h.secretKeyUseCase.RevokeSecretKey(secretKeyID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to revoke secret key: " + err.Error(),
		})
		return
	}

	// target é o nome da aplicação — mesmo padrão de GenerateSecretKey (confirmado no protótipo
	// real: `logAudit("key", "Revoked service key", app?.name || "")`).
	appName := ""
	if applicationID != "" {
		if app, err := h.applicationUseCase.GetApplicationByID(applicationID); err == nil {
			appName = app.Name
		}
	}
	h.auditUseCase.RecordForApplication(entity.AuditEventKeyRevoked, "Service key revoked", appName, applicationID, auditActor(c))

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Secret key revoked successfully",
	})
}
