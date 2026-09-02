package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/usecase"
)

// ToggleHandler gerencia as requisições HTTP para toggles
type ToggleHandler struct {
	toggleUseCase      *usecase.ToggleUseCase
	applicationUseCase *usecase.ApplicationUseCase
	auditUseCase       *usecase.AuditUseCase
}

// NewToggleHandler cria uma nova instância de ToggleHandler. applicationUseCase é usado só pra
// resolver o nome da aplicação no `target` dos eventos de auditoria (confirmado no protótipo
// real — AUDIT_SEED/app.jsx#logAudit: toggle create/enable/disable/delete sempre mostram o nome
// da aplicação como terceira linha do item, não só texto+meta; achado real depois que o usuário
// reportou que os itens do History estavam em 2 linhas em vez de 3).
func NewToggleHandler(toggleUseCase *usecase.ToggleUseCase, applicationUseCase *usecase.ApplicationUseCase, auditUseCase *usecase.AuditUseCase) *ToggleHandler {
	return &ToggleHandler{
		toggleUseCase:      toggleUseCase,
		applicationUseCase: applicationUseCase,
		auditUseCase:       auditUseCase,
	}
}

// applicationName resolve o nome da aplicação pro `target` do audit log — nunca falha a
// requisição principal se a busca der erro (mesma tolerância de RecordForApplication a falhas
// de auditoria: a mutação já aconteceu, um `target` vazio é preferível a travar a resposta).
func (h *ToggleHandler) applicationName(appID string) string {
	app, err := h.applicationUseCase.GetApplicationByID(appID)
	if err != nil {
		return ""
	}
	return app.Name
}

// auditActor lê o usuário autenticado do contexto Gin pra gravar auditoria — nunca falha a
// requisição se, por algum motivo, o middleware de auth não tiver rodado (não deveria acontecer
// em nenhuma rota real, mas Record já tolera actor nil, então aqui só evita um type assertion
// que panica).
func auditActor(c *gin.Context) *entity.User {
	u, exists := c.Get("user")
	if !exists {
		return nil
	}
	user, ok := u.(*entity.User)
	if !ok {
		return nil
	}
	return user
}

// CreateToggleRequest representa a requisição para criar um toggle
type CreateToggleRequest struct {
	Toggle string `json:"toggle" binding:"required"`
}

// UpdateToggleRequest representa a requisição para atualizar um toggle
type UpdateToggleRequest struct {
	Enabled           bool                   `json:"enabled"`
	HasActivationRule bool                   `json:"has_activation_rule"`
	ActivationRule    *entity.ActivationRule `json:"activation_rule,omitempty"`
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

	// <b>...</b> em volta do path: confirmado no protótipo real (app.jsx#logAudit e o AUDIT_SEED
	// literal — "Created toggle <b>checkout.express</b>"). O frontend nunca usa
	// dangerouslySetInnerHTML pra isso — lib/auditEvents.tsx#renderAuditText só reconhece esse
	// marcador literal e monta um <b> React de verdade, então mesmo um path/nome controlado por
	// quem chama a API não vira HTML executável (ver os testes de segurança daquele parser).
	// Confirmado no protótipo real (AUDIT_SEED): target é o nome da aplicação ("Checkout
	// Service"), não o path do toggle de novo (que já está em negrito no texto).
	h.auditUseCase.RecordForApplication(entity.AuditEventToggleCreated, "Created toggle <b>"+req.Toggle+"</b>", h.applicationName(appID), appID, auditActor(c))

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

	var req UpdateToggleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		appErr := entity.NewAppError(entity.ErrCodeValidation, "validation failed")
		appErr.AddDetail("request", "Invalid request body")
		c.JSON(http.StatusBadRequest, appErr)
		return
	}

	updatedToggle, err := h.toggleUseCase.UpdateToggleWithRule(toggleID, req.Enabled, req.HasActivationRule, req.ActivationRule, appID)
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

	// has_activation_rule/activation_rule no corpo distingue "mudou a regra" de "só ligou/
	// desligou" — mesma heurística de getActionType (middleware/approval.go) pro mesmo par de
	// rotas, aqui só pra escolher o tipo de evento de auditoria certo.
	if req.HasActivationRule && req.ActivationRule != nil {
		// Confirmado no protótipo real (app.jsx#saveDrawer): "Set <b>{type}</b> rule" pra
		// qualquer tipo, com um sufixo " to <b>{value}%</b>" só quando o tipo é percentage —
		// os outros 6 tipos (parameter/user_id/canary/ip/country/time) não têm esse sufixo. O
		// `<b>` é o marcador literal que lib/auditEvents.tsx#renderAuditText reconhece pra
		// negrito real (nunca dangerouslySetInnerHTML) — não uma tag HTML de verdade sendo
		// injetada.
		ruleText := "Set <b>" + string(req.ActivationRule.Type) + "</b> rule"
		if req.ActivationRule.Type == entity.ActivationRuleTypePercentage {
			ruleText += " to <b>" + req.ActivationRule.Value + "%</b>"
		}
		h.auditUseCase.RecordForApplication(entity.AuditEventToggleRuleSet, ruleText, updatedToggle.Path, appID, auditActor(c))
	} else {
		eventType := entity.AuditEventToggleDisabled
		verb := "Disabled"
		if req.Enabled {
			eventType = entity.AuditEventToggleEnabled
			verb = "Enabled"
		}
		// Confirmado no protótipo real (app.jsx#saveDrawer): `${enabled?"Enabled":"Disabled"}
		// <b>${seg}</b>` — bolda só o ÚLTIMO segmento (Value), não o path inteiro; target é
		// `{app.name} · {path completo}`.
		h.auditUseCase.RecordForApplication(eventType, verb+" <b>"+updatedToggle.Value+"</b>", h.applicationName(appID)+" · "+updatedToggle.Path, appID, auditActor(c))
	}

	c.JSON(http.StatusOK, updatedToggle)
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

	// Path só existe pra montar a mensagem de auditoria (o próprio delete não devolve o toggle
	// apagado) — buscado antes da exclusão, de propósito; se falhar, segue sem travar o delete
	// (RecordForApplication com target vazio ainda é melhor que não gravar o evento).
	var lastSegment string
	if toggle, err := h.toggleUseCase.GetToggleByID(toggleID, appID); err == nil {
		lastSegment = toggle.Value
	}

	err := h.toggleUseCase.DeleteToggleByID(toggleID, appID)
	if err != nil {
		appErr, ok := err.(*entity.AppError)
		if ok {
			status := http.StatusBadRequest
			switch appErr.Code {
			case entity.ErrCodeNotFound:
				status = http.StatusNotFound
			case entity.ErrCodeHasChildren:
				status = http.StatusBadRequest
			}
			c.JSON(status, appErr)
			return
		}
		c.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, "internal server error"))
		return
	}

	// Confirmado no protótipo real (app.jsx#doDeleteToggle): bolda só o ÚLTIMO segmento do path
	// (`label.split(".").pop()`), não o path inteiro; target é o nome da aplicação.
	h.auditUseCase.RecordForApplication(entity.AuditEventToggleDeleted, "Deleted toggle <b>"+lastSegment+"</b>", h.applicationName(appID), appID, auditActor(c))

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

	// Buscar o toggle atualizado para retornar
	updatedToggle, err := h.toggleUseCase.GetToggleByID(toggleID, appID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, "error fetching updated toggle"))
		return
	}

	eventType := entity.AuditEventToggleDisabled
	verb := "Disabled"
	if req.Enabled {
		eventType = entity.AuditEventToggleEnabled
		verb = "Enabled"
	}
	// Confirmado no protótipo real (app.jsx#handleToggle): `${enabled?"Disabled":"Enabled"}
	// <b>${seg}</b>`, target `{app.name} · {path completo}` — mesmo padrão do enable/disable via
	// drawer acima, só que pelo endpoint recursivo (liga/desliga a subárvore inteira de uma vez).
	h.auditUseCase.RecordForApplication(eventType, verb+" <b>"+updatedToggle.Value+"</b>", h.applicationName(appID)+" · "+updatedToggle.Path, appID, auditActor(c))

	c.JSON(http.StatusOK, updatedToggle)
}
