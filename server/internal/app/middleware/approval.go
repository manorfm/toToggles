package middleware

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/usecase"
)

// ApprovalAware cria um middleware que verifica se o sistema de aprovação está habilitado
// Se estiver habilitado e a ação requerer aprovação, bloqueia e redireciona para aprovação
// Se estiver desabilitado, permite que a requisição continue normalmente
func ApprovalAware(approvalUseCase *usecase.ApprovalUseCase, requiredRole entity.UserRole) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Obter usuário do contexto
		userInterface, exists := c.Get("user")
		if !exists {
			c.JSON(http.StatusUnauthorized, entity.NewAppError(entity.ErrCodeValidation, "user not authenticated"))
			c.Abort()
			return
		}

		user, ok := userInterface.(*entity.User)
		if !ok {
			c.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, "invalid user context"))
			c.Abort()
			return
		}

		// Root users sempre passam
		if user.Role == entity.UserRoleRoot {
			c.Next()
			return
		}

		// Verificar se o sistema de aprovação está habilitado
		ctx := context.Background()
		enabled, err := approvalUseCase.IsApprovalEnabled(ctx)
		if err != nil || !enabled {
			// Sistema desabilitado - aplicar verificação normal de role
			if !hasRequiredRole(user.Role, requiredRole) {
				c.JSON(http.StatusForbidden, entity.NewAppError(entity.ErrCodeValidation, "insufficient permissions"))
				c.Abort()
				return
			}
			c.Next()
			return
		}

		// Sistema habilitado - verificar se a ação requer aprovação
		actionType := getActionType(c.Request.Method, c.Request.URL.Path)
		
		required, err := approvalUseCase.RequiresApproval(ctx, actionType)
		if err != nil {
			c.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, "error checking approval requirements"))
			c.Abort()
			return
		}

		if !required {
			// Aprovação não necessária para esta ação - aplicar verificação normal de role
			if !hasRequiredRole(user.Role, requiredRole) {
				c.JSON(http.StatusForbidden, entity.NewAppError(entity.ErrCodeValidation, "insufficient permissions"))
				c.Abort()
				return
			}
			c.Next()
			return
		}

		// Aprovação necessária - criar solicitação de aprovação
		err = createApprovalRequest(c, approvalUseCase, user, actionType)
		if err != nil {
			c.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, "failed to create approval request: "+err.Error()))
			c.Abort()
			return
		}

		c.JSON(http.StatusAccepted, gin.H{
			"message": "action requires approval",
			"approval_required": true,
			"action_type": actionType,
		})
		c.Abort()
	}
}

// hasRequiredRole verifica se o usuário tem o role necessário
func hasRequiredRole(userRole, requiredRole entity.UserRole) bool {
	switch requiredRole {
	case entity.UserRoleRoot:
		return userRole == entity.UserRoleRoot
	case entity.UserRoleAdmin:
		return userRole == entity.UserRoleRoot || userRole == entity.UserRoleAdmin
	case entity.UserRoleUser:
		return true // Todos os usuários autenticados podem acessar
	default:
		return false
	}
}

// getActionType mapeia o método HTTP e caminho para um tipo de ação
func getActionType(method, path string) entity.ApprovalActionType {
	switch {
	case method == "POST" && strings.Contains(path, "/applications") && !strings.Contains(path, "/toggles"):
		return entity.ApprovalActionApplicationCreate
	case method == "DELETE" && strings.Contains(path, "/applications") && !strings.Contains(path, "/toggles"):
		return entity.ApprovalActionApplicationDelete
	case method == "PUT" && strings.Contains(path, "/applications") && !strings.Contains(path, "/toggles"):
		return entity.ApprovalActionApplicationCreate // PUT pode ser considerado update, mas não há constante específica
	case method == "POST" && strings.Contains(path, "/toggles"):
		return entity.ApprovalActionToggleCreate
	case method == "DELETE" && strings.Contains(path, "/toggles"):
		return entity.ApprovalActionToggleDelete
	case method == "PUT" && strings.Contains(path, "/toggles"):
		return entity.ApprovalActionToggleUpdate
	case method == "PUT" && strings.Contains(path, "/toggle/"):
		return entity.ApprovalActionToggleUpdate // Bulk update considerado como update
	default:
		return entity.ApprovalActionType("unknown")
	}
}

// createApprovalRequest cria uma solicitação de aprovação baseada na requisição HTTP
func createApprovalRequest(c *gin.Context, approvalUseCase *usecase.ApprovalUseCase, user *entity.User, actionType entity.ApprovalActionType) error {
	ctx := context.Background()
	
	// Capturar dados da requisição
	var actionData interface{}
	var applicationID *string
	var toggleID *string
	var description string
	
	// Ler o corpo da requisição
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		return err
	}
	
	// Restaurar o corpo da requisição para futuras leituras
	c.Request.Body = io.NopCloser(strings.NewReader(string(body)))
	
	// Processar dados baseado no tipo de ação
	switch actionType {
	case entity.ApprovalActionToggleCreate:
		// Extrair application ID da URL
		appID := c.Param("id")
		if appID != "" {
			applicationID = &appID
		}
		
		// Deserializar dados do toggle
		var toggleData struct {
			Toggle string `json:"toggle"`
		}
		if err := json.Unmarshal(body, &toggleData); err == nil {
			actionData = toggleData
			description = "Create toggle: " + toggleData.Toggle
		}
		
	case entity.ApprovalActionToggleUpdate:
		// Extrair IDs da URL
		appID := c.Param("id")
		tgID := c.Param("toggleId")
		if appID != "" {
			applicationID = &appID
		}
		if tgID != "" {
			toggleID = &tgID
		}
		
		// Usar dados da requisição como estão
		var updateData map[string]interface{}
		if err := json.Unmarshal(body, &updateData); err == nil {
			actionData = updateData
			description = "Update toggle"
		}
		
	case entity.ApprovalActionToggleDelete:
		// Extrair IDs da URL
		appID := c.Param("id")
		tgID := c.Param("toggleId")
		if appID != "" {
			applicationID = &appID
		}
		if tgID != "" {
			toggleID = &tgID
		}
		description = "Delete toggle"
		
	case entity.ApprovalActionApplicationCreate:
		// Usar dados da requisição
		var appData map[string]interface{}
		if err := json.Unmarshal(body, &appData); err == nil {
			actionData = appData
			if name, ok := appData["name"].(string); ok {
				description = "Create application: " + name
			} else {
				description = "Create application"
			}
		}
		
	case entity.ApprovalActionApplicationDelete:
		// Extrair application ID da URL
		appID := c.Param("id")
		if appID != "" {
			applicationID = &appID
		}
		description = "Delete application"
		
	default:
		description = "Unknown action"
	}
	
	// Determinar teamID dinamicamente baseado na ação
	teamID, err := determineTeamID(c, approvalUseCase, actionType, applicationID, user.ID)
	if err != nil {
		return err
	}
	
	// Criar a solicitação de aprovação
	_, err = approvalUseCase.CreateApprovalRequest(
		ctx,
		actionType,
		description,
		user.ID,
		teamID,
		applicationID,
		toggleID,
		actionData,
	)
	
	return err
}

// determineTeamID determina qual team ID usar para a solicitação de aprovação
func determineTeamID(c *gin.Context, approvalUseCase *usecase.ApprovalUseCase, actionType entity.ApprovalActionType, applicationID *string, userID string) (string, error) {
	ctx := context.Background()
	
	switch actionType {
	case entity.ApprovalActionToggleCreate, entity.ApprovalActionToggleUpdate, entity.ApprovalActionToggleDelete:
		// Para ações de toggle, usar o team associado à aplicação
		if applicationID == nil {
			return "", entity.NewAppError(entity.ErrCodeValidation, "application ID is required for toggle actions")
		}
		
		// Buscar qual team o usuário tem acesso nesta aplicação
		return approvalUseCase.GetUserTeamForApplication(ctx, userID, *applicationID)
		
	case entity.ApprovalActionApplicationCreate, entity.ApprovalActionApplicationDelete:
		// Para ações de aplicação, usar o primeiro team do usuário
		return getFirstUserTeam(ctx, approvalUseCase, userID)
		
	default:
		return "", entity.NewAppError(entity.ErrCodeValidation, "unknown action type for team determination")
	}
}

// getFirstUserTeam obtém o primeiro team do usuário
func getFirstUserTeam(ctx context.Context, approvalUseCase *usecase.ApprovalUseCase, userID string) (string, error) {
	return approvalUseCase.GetFirstUserTeam(ctx, userID)
}