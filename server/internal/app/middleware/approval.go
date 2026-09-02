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
		actionType := getActionType(c)

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
		request, err := createApprovalRequest(c, approvalUseCase, user, actionType)
		if err != nil {
			c.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, "failed to create approval request: "+err.Error()))
			c.Abort()
			return
		}

		response := gin.H{
			"message":           "action requires approval",
			"approval_required": true,
			"action_type":       actionType,
		}
		// secret_key_create: quem pediu pode pegar a chave e configurar o serviço já — ela só
		// fica válida pra autenticação depois de aprovada (SecretKey.Active), mas não há motivo
		// pra fazer o requester esperar a aprovação pra ter o valor em mãos. Ver
		// ApprovalUseCase.CreateApprovalRequest (gera a chave já aqui) e RejectRequest (apaga
		// fisicamente o registro se a solicitação for rejeitada).
		if request != nil && request.PlainSecretKey != "" {
			response["plain_key"] = request.PlainSecretKey
			response["warning"] = "This key will only be shown once. Please store it securely. It will not work until the request is approved."
		}
		c.JSON(http.StatusAccepted, response)
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

// peekJSONBody lê o corpo da requisição como JSON genérico e o restaura para leituras futuras
// (o handler real, e createApprovalRequest, ainda precisam poder lê-lo depois).
func peekJSONBody(c *gin.Context) map[string]interface{} {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		return nil
	}
	c.Request.Body = io.NopCloser(strings.NewReader(string(body)))

	var m map[string]interface{}
	if err := json.Unmarshal(body, &m); err != nil {
		return nil
	}
	return m
}

// getActionType mapeia método HTTP + caminho (e, quando necessário, o corpo) para um tipo de ação.
// toggle_enable/toggle_disable (endpoint recursivo singular) e toggle_rule (endpoint plural, quando
// a requisição mexe na regra de ativação) só podem ser distinguidos de toggle_update olhando o
// corpo — os demais tipos são inferíveis só por método+path, como antes.
func getActionType(c *gin.Context) entity.ApprovalActionType {
	method := c.Request.Method
	path := c.Request.URL.Path

	switch {
	case method == "POST" && strings.Contains(path, "/generate-secret"):
		return entity.ApprovalActionSecretKeyCreate
	case method == "DELETE" && strings.Contains(path, "/secret-keys/"):
		return entity.ApprovalActionSecretKeyDelete
	case method == "POST" && strings.Contains(path, "/applications") && !strings.Contains(path, "/toggles"):
		return entity.ApprovalActionApplicationCreate
	case method == "DELETE" && strings.Contains(path, "/applications") && !strings.Contains(path, "/toggles"):
		return entity.ApprovalActionApplicationDelete
	case method == "PUT" && strings.Contains(path, "/applications") && !strings.Contains(path, "/toggle"):
		return entity.ApprovalActionApplicationCreate // PUT pode ser considerado update, mas não há constante específica
	case method == "POST" && strings.Contains(path, "/toggles"):
		return entity.ApprovalActionToggleCreate
	case method == "DELETE" && strings.Contains(path, "/toggles"):
		return entity.ApprovalActionToggleDelete
	case method == "PUT" && strings.Contains(path, "/toggles"):
		// Endpoint plural (não-recursivo): se a requisição está ligando/alterando a regra de
		// ativação, é toggle_rule; senão é um toggle_update comum (só enabled do próprio nó).
		// Limitação conhecida: não detecta LIMPAR uma regra pré-existente
		// (has_activation_rule: false) como alteração de regra, pois isso exigiria ler o estado
		// atual no banco, que este middleware não tem — mesmo trade-off de simplicidade já usado
		// no resto desta função.
		if body := peekJSONBody(c); body != nil {
			if hasRule, ok := body["has_activation_rule"].(bool); ok && hasRule {
				return entity.ApprovalActionToggleRule
			}
			if rule, ok := body["activation_rule"]; ok && rule != nil {
				return entity.ApprovalActionToggleRule
			}
		}
		return entity.ApprovalActionToggleUpdate
	case method == "PUT" && strings.Contains(path, "/toggle/"):
		// Endpoint recursivo singular: liga/desliga a subárvore inteira.
		if body := peekJSONBody(c); body != nil {
			if enabled, ok := body["enabled"].(bool); ok {
				if enabled {
					return entity.ApprovalActionToggleEnable
				}
				return entity.ApprovalActionToggleDisable
			}
		}
		return entity.ApprovalActionToggleUpdate
	default:
		return entity.ApprovalActionType("unknown")
	}
}

// createApprovalRequest cria uma solicitação de aprovação baseada na requisição HTTP. Devolve o
// ApprovalRequest criado (não só erro) porque secret_key_create precisa repassar a chave em texto
// puro pra quem pediu — ver ApprovalRequest.PlainSecretKey e o caso especial logo abaixo.
func createApprovalRequest(c *gin.Context, approvalUseCase *usecase.ApprovalUseCase, user *entity.User, actionType entity.ApprovalActionType) (*entity.ApprovalRequest, error) {
	ctx := context.Background()

	// Capturar dados da requisição
	var actionData interface{}
	var applicationID *string
	var toggleID *string
	var description string

	// Ler o corpo da requisição
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		return nil, err
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
			// Confirmado no protótipo real (app.jsx#createToggle): a descrição da solicitação é
			// só o nome curto da ação — o path vai no `target` do evento de auditoria
			// (ApprovalUseCase#approvalRequestTarget), não embutido aqui.
			description = "Create toggle"
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
		// PUT /applications/:id (edição) cai no mesmo action_type de criação — não existe
		// application_update (docs/rest-flow.md §9.1). Só a presença de :id na URL distingue os
		// dois; sem capturar applicationID aqui, a execução (ExecuteApprovedAction) não tinha
		// como saber que era uma edição e sempre tentava criar uma aplicação nova (achado
		// escrevendo o e2e de "editar aplicação com aprovação" — falhava sempre, por faltar
		// team_id, já que uma edição de nome não manda esse campo).
		if appID := c.Param("id"); appID != "" {
			applicationID = &appID
		}

		var appData map[string]interface{}
		if err := json.Unmarshal(body, &appData); err == nil {
			actionData = appData
			verb := "Create"
			if applicationID != nil {
				verb = "Update"
			}
			// Nome curto só — o nome da aplicação vai no `target` do evento de auditoria
			// (ApprovalUseCase#approvalRequestTarget), mesmo padrão do toggle create acima.
			description = verb + " application"
		}

	case entity.ApprovalActionApplicationDelete:
		// Extrair application ID da URL
		appID := c.Param("id")
		if appID != "" {
			applicationID = &appID
		}
		description = "Delete application"

	case entity.ApprovalActionToggleEnable, entity.ApprovalActionToggleDisable, entity.ApprovalActionToggleRule:
		// Mesma extração de toggle_update: mesmas rotas (plural para rule, singular para enable/disable),
		// mesmo formato de corpo.
		appID := c.Param("id")
		tgID := c.Param("toggleId")
		if appID != "" {
			applicationID = &appID
		}
		if tgID != "" {
			toggleID = &tgID
		}

		var updateData map[string]interface{}
		if err := json.Unmarshal(body, &updateData); err == nil {
			actionData = updateData
		}

		switch actionType {
		case entity.ApprovalActionToggleEnable:
			description = "Enable toggle"
		case entity.ApprovalActionToggleDisable:
			description = "Disable toggle"
		default:
			description = "Configure activation rule"
		}

	case entity.ApprovalActionSecretKeyCreate:
		// Extrair application ID da URL
		appID := c.Param("id")
		if appID != "" {
			applicationID = &appID
		}
		actionData = map[string]interface{}{
			"application_id": appID,
		}
		description = "Generate secret key"

	case entity.ApprovalActionSecretKeyDelete:
		// A URL só carrega o ID da secret key, não a aplicação — resolve via lookup pra poder
		// escopar a solicitação por team.
		secretKeyID := c.Param("id")
		if appID, err := approvalUseCase.GetApplicationIDForSecretKey(secretKeyID); err == nil && appID != "" {
			applicationID = &appID
		}
		actionData = map[string]interface{}{
			"secret_key_id": secretKeyID,
		}
		description = "Delete secret key"

	default:
		description = "Unknown action"
	}

	// Determinar teamID dinamicamente baseado na ação
	teamID, err := determineTeamID(c, approvalUseCase, actionType, applicationID, user.ID)
	if err != nil {
		return nil, err
	}

	// Criar a solicitação de aprovação
	request, err := approvalUseCase.CreateApprovalRequest(
		ctx,
		actionType,
		description,
		user.ID,
		teamID,
		applicationID,
		toggleID,
		actionData,
	)

	return request, err
}

// determineTeamID determina qual team ID usar para a solicitação de aprovação
func determineTeamID(c *gin.Context, approvalUseCase *usecase.ApprovalUseCase, actionType entity.ApprovalActionType, applicationID *string, userID string) (string, error) {
	ctx := context.Background()

	switch actionType {
	case entity.ApprovalActionToggleCreate, entity.ApprovalActionToggleUpdate, entity.ApprovalActionToggleDelete,
		entity.ApprovalActionToggleEnable, entity.ApprovalActionToggleDisable, entity.ApprovalActionToggleRule:
		// Para ações de toggle, usar o team associado à aplicação
		if applicationID == nil {
			return "", entity.NewAppError(entity.ErrCodeValidation, "application ID is required for toggle actions")
		}

		// Buscar qual team o usuário tem acesso nesta aplicação
		return approvalUseCase.GetUserTeamForApplication(ctx, userID, *applicationID)

	case entity.ApprovalActionApplicationCreate, entity.ApprovalActionApplicationDelete:
		// Se a aplicação já existe (PUT de edição, que reusa este mesmo action_type — não há
		// application_update, ver docs/rest-flow.md §9.1 — ou um DELETE de verdade), resolve o
		// team pela aplicação real, não pelo "primeiro team do usuário": um admin em múltiplos
		// teams pode não ter a aplicação no seu primeiro team.
		if applicationID != nil {
			return approvalUseCase.GetUserTeamForApplication(ctx, userID, *applicationID)
		}

		// Criação de verdade (POST /applications, sem :id ainda): o cliente já manda team_id no
		// corpo (campo obrigatório em application_handler.go#CreateApplicationRequest) — é esse
		// team que deve ser dono da solicitação, não "o primeiro team do usuário". Usar o
		// primeiro team ignorava a escolha do usuário sempre que ele pertencia a mais de um team,
		// filiando a solicitação a um time errado — invisível para os aprovadores do time
		// realmente escolhido (achado investigando um report ao vivo).
		if body := peekJSONBody(c); body != nil {
			if teamID, ok := body["team_id"].(string); ok && teamID != "" {
				return teamID, nil
			}
		}
		return "", entity.NewAppError(entity.ErrCodeValidation, "team_id is required to create an application")

	case entity.ApprovalActionSecretKeyCreate, entity.ApprovalActionSecretKeyDelete:
		// Secret keys pertencem a uma aplicação — mesmo raciocínio das ações de toggle
		if applicationID == nil {
			return "", entity.NewAppError(entity.ErrCodeValidation, "application ID is required for secret key actions")
		}
		return approvalUseCase.GetUserTeamForApplication(ctx, userID, *applicationID)

	default:
		return "", entity.NewAppError(entity.ErrCodeValidation, "unknown action type for team determination")
	}
}
