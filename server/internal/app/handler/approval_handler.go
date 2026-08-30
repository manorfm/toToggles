package handler

import (
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/usecase"
)

type ApprovalHandler struct {
	approvalUseCase *usecase.ApprovalUseCase
}

func NewApprovalHandler(approvalUseCase *usecase.ApprovalUseCase) *ApprovalHandler {
	return &ApprovalHandler{
		approvalUseCase: approvalUseCase,
	}
}

// ============================
// Configurações de Aprovação (Root Only)
// ============================

// GetApprovalSettings busca as configurações de aprovação
func (h *ApprovalHandler) GetApprovalSettings(ctx *gin.Context) {
	settings, err := h.approvalUseCase.GetApprovalSettings(ctx.Request.Context())
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, err.Error()))
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message": "approval settings retrieved successfully",
		"data":    settings,
	})
}

// UpdateApprovalSettings atualiza as configurações de aprovação (apenas root)
func (h *ApprovalHandler) UpdateApprovalSettings(ctx *gin.Context) {
	userID := getUserIDFromSession(ctx)
	if userID == "" {
		ctx.JSON(http.StatusUnauthorized, entity.NewAppError(entity.ErrCodeValidation, "user not authenticated"))
		return
	}

	var req entity.UpdateApprovalSettingsRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, entity.NewAppError(entity.ErrCodeValidation, err.Error()))
		return
	}

	settings, err := h.approvalUseCase.UpdateApprovalSettings(ctx.Request.Context(), userID, &req)
	if err != nil {
		if err.Error() == "only root users can modify approval settings" {
			ctx.JSON(http.StatusForbidden, entity.NewAppError(entity.ErrCodeValidation, err.Error()))
			return
		}
		ctx.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, err.Error()))
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message": "approval settings updated successfully",
		"data":    settings,
	})
}

// ============================
// Solicitações de Aprovação
// ============================

// CreateApprovalRequest cria uma nova solicitação de aprovação
func (h *ApprovalHandler) CreateApprovalRequest(ctx *gin.Context) {
	userID := getUserIDFromSession(ctx)
	if userID == "" {
		ctx.JSON(http.StatusUnauthorized, entity.NewAppError(entity.ErrCodeValidation, "user not authenticated"))
		return
	}

	var req struct {
		ActionType    entity.ApprovalActionType `json:"action_type" binding:"required"`
		Description   string                    `json:"description" binding:"required"`
		TeamID        string                    `json:"team_id" binding:"required"`
		ApplicationID *string                   `json:"application_id,omitempty"`
		ToggleID      *string                   `json:"toggle_id,omitempty"`
		ActionData    interface{}               `json:"action_data,omitempty"`
	}

	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, entity.NewAppError(entity.ErrCodeValidation, err.Error()))
		return
	}

	request, err := h.approvalUseCase.CreateApprovalRequest(
		ctx.Request.Context(),
		req.ActionType,
		req.Description,
		userID,
		req.TeamID,
		req.ApplicationID,
		req.ToggleID,
		req.ActionData,
	)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, entity.NewAppError(entity.ErrCodeValidation, err.Error()))
		return
	}

	ctx.JSON(http.StatusCreated, gin.H{
		"message": "approval request created successfully",
		"data":    request,
	})
}

// GetApprovalRequest busca uma solicitação específica. Um caller sem acesso ao team dono da
// solicitação recebe 404 (não 403) — não confirmamos a um estranho que o ID existe.
func (h *ApprovalHandler) GetApprovalRequest(ctx *gin.Context) {
	user := getUserFromSession(ctx)
	if user == nil {
		ctx.JSON(http.StatusUnauthorized, entity.NewAppError(entity.ErrCodeValidation, "user not authenticated"))
		return
	}

	requestID := ctx.Param("id")
	if requestID == "" {
		ctx.JSON(http.StatusBadRequest, entity.NewAppError(entity.ErrCodeValidation, "request ID is required"))
		return
	}

	request, err := h.approvalUseCase.GetApprovalRequest(ctx.Request.Context(), requestID, user)
	if err != nil {
		ctx.JSON(http.StatusNotFound, entity.NewAppError(entity.ErrCodeNotFound, err.Error()))
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message": "approval request retrieved successfully",
		"data":    request,
	})
}

// GetAllApprovalRequests alimenta a tela de History: root vê tudo, qualquer outro role só vê as
// solicitações dos teams dos quais é membro.
func (h *ApprovalHandler) GetAllApprovalRequests(ctx *gin.Context) {
	user := getUserFromSession(ctx)
	if user == nil {
		ctx.JSON(http.StatusUnauthorized, entity.NewAppError(entity.ErrCodeValidation, "user not authenticated"))
		return
	}

	requests, err := h.approvalUseCase.GetAllApprovalRequests(ctx.Request.Context(), user)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, err.Error()))
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message": "approval requests retrieved successfully",
		"data":    requests,
	})
}

// GetPendingApprovalRequests lista solicitações pendentes
func (h *ApprovalHandler) GetPendingApprovalRequests(ctx *gin.Context) {
	requests, err := h.approvalUseCase.GetPendingApprovalRequests(ctx.Request.Context())
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, err.Error()))
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message": "pending approval requests retrieved successfully",
		"data":    requests,
	})
}

// GetApprovalRequestsByTeam lista todas as solicitações (qualquer status) de um team — requer
// que o caller seja membro do team (ou root).
func (h *ApprovalHandler) GetApprovalRequestsByTeam(ctx *gin.Context) {
	user := getUserFromSession(ctx)
	if user == nil {
		ctx.JSON(http.StatusUnauthorized, entity.NewAppError(entity.ErrCodeValidation, "user not authenticated"))
		return
	}

	teamID := ctx.Param("id")
	if teamID == "" {
		ctx.JSON(http.StatusBadRequest, entity.NewAppError(entity.ErrCodeValidation, "team ID is required"))
		return
	}

	requests, err := h.approvalUseCase.GetApprovalRequestsByTeam(ctx.Request.Context(), teamID, user)
	if err != nil {
		if errors.Is(err, usecase.ErrApprovalAccessDenied) {
			ctx.JSON(http.StatusForbidden, entity.NewAppError(entity.ErrCodeValidation, err.Error()))
			return
		}
		ctx.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, err.Error()))
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message": "team approval requests retrieved successfully",
		"data":    requests,
	})
}

// GetMyApprovalRequests lista solicitações do usuário atual
func (h *ApprovalHandler) GetMyApprovalRequests(ctx *gin.Context) {
	userID := getUserIDFromSession(ctx)
	if userID == "" {
		ctx.JSON(http.StatusUnauthorized, entity.NewAppError(entity.ErrCodeValidation, "user not authenticated"))
		return
	}

	requests, err := h.approvalUseCase.GetMyApprovalRequests(ctx.Request.Context(), userID)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, err.Error()))
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message": "user approval requests retrieved successfully",
		"data":    requests,
	})
}

// GetApprovableRequests lista solicitações que o usuário pode aprovar
func (h *ApprovalHandler) GetApprovableRequests(ctx *gin.Context) {
	userInterface, exists := ctx.Get("user")
	if !exists {
		ctx.JSON(http.StatusUnauthorized, entity.NewAppError(entity.ErrCodeValidation, "user not authenticated"))
		return
	}

	user, ok := userInterface.(*entity.User)
	if !ok {
		ctx.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, "invalid user context"))
		return
	}

	userID := user.ID

	// Enhanced debug logging
	log.Printf("[CRITICAL_DEBUG] GetApprovableRequests: Starting - UserID=%s, Username=%s, Role=%s", userID, user.Username, user.Role)

	requests, err := h.approvalUseCase.GetApprovableRequests(ctx.Request.Context(), userID)
	if err != nil {
		log.Printf("[ERROR] GetApprovableRequests: UseCase error for UserID=%s: %v", userID, err)
		ctx.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, err.Error()))
		return
	}

	// Debug logging para identificar quando retorna vazio ou null
	log.Printf("[DEBUG] GetApprovableRequests: UserID=%s, RequestsFound=%d, RequestsIsNil=%v", userID, len(requests), requests == nil)

	if requests != nil && len(requests) > 0 {
		log.Printf("[DEBUG] GetApprovableRequests: First request ID=%s, ActionType=%s", requests[0].ID, requests[0].ActionType)
	} else {
		log.Printf("[IMPORTANT] GetApprovableRequests: No requests found for Username=%s - this might be because user is the requester of pending requests (cannot approve own requests)", user.Username)
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message": "approvable requests retrieved successfully",
		"data":    requests,
	})
}

// ============================
// Aprovação/Rejeição
// ============================

// ApproveRequest aprova uma solicitação
func (h *ApprovalHandler) ApproveRequest(ctx *gin.Context) {
	user := getUserFromSession(ctx)
	if user == nil {
		ctx.JSON(http.StatusUnauthorized, entity.NewAppError(entity.ErrCodeValidation, "user not authenticated"))
		return
	}

	requestID := ctx.Param("id")
	if requestID == "" {
		ctx.JSON(http.StatusBadRequest, entity.NewAppError(entity.ErrCodeValidation, "request ID is required"))
		return
	}

	err := h.approvalUseCase.ApproveRequest(ctx.Request.Context(), requestID, user)
	if err != nil {
		if err.Error() == "user cannot approve this request" || err.Error() == "user is not an approver for this team" {
			ctx.JSON(http.StatusForbidden, entity.NewAppError(entity.ErrCodeValidation, err.Error()))
			return
		}
		ctx.JSON(http.StatusBadRequest, entity.NewAppError(entity.ErrCodeValidation, err.Error()))
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message": "request approved successfully",
	})
}

// RejectRequest rejeita uma solicitação
func (h *ApprovalHandler) RejectRequest(ctx *gin.Context) {
	user := getUserFromSession(ctx)
	if user == nil {
		ctx.JSON(http.StatusUnauthorized, entity.NewAppError(entity.ErrCodeValidation, "user not authenticated"))
		return
	}

	requestID := ctx.Param("id")
	if requestID == "" {
		ctx.JSON(http.StatusBadRequest, entity.NewAppError(entity.ErrCodeValidation, "request ID is required"))
		return
	}

	var req struct {
		Reason string `json:"reason"`
	}

	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, entity.NewAppError(entity.ErrCodeValidation, err.Error()))
		return
	}

	err := h.approvalUseCase.RejectRequest(ctx.Request.Context(), requestID, user, req.Reason)
	if err != nil {
		if err.Error() == "user cannot reject this request" || err.Error() == "user is not an approver for this team" {
			ctx.JSON(http.StatusForbidden, entity.NewAppError(entity.ErrCodeValidation, err.Error()))
			return
		}
		ctx.JSON(http.StatusBadRequest, entity.NewAppError(entity.ErrCodeValidation, err.Error()))
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message": "request rejected successfully",
	})
}

// ============================
// Gerenciamento de Aprovadores
// ============================

// SetTeamApprover define um usuário como aprovador de um team
func (h *ApprovalHandler) SetTeamApprover(ctx *gin.Context) {
	actionByUserID := getUserIDFromSession(ctx)
	if actionByUserID == "" {
		ctx.JSON(http.StatusUnauthorized, entity.NewAppError(entity.ErrCodeValidation, "user not authenticated"))
		return
	}

	teamID := ctx.Param("id")
	userID := ctx.Param("user_id")
	if teamID == "" || userID == "" {
		ctx.JSON(http.StatusBadRequest, entity.NewAppError(entity.ErrCodeValidation, "team ID and user ID are required"))
		return
	}

	var req struct {
		IsApprover bool `json:"is_approver"`
	}

	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, entity.NewAppError(entity.ErrCodeValidation, err.Error()))
		return
	}

	err := h.approvalUseCase.SetTeamApprover(ctx.Request.Context(), teamID, userID, req.IsApprover, actionByUserID)
	if err != nil {
		// Verificar se é erro de permissão
		if strings.Contains(err.Error(), "insufficient permissions") ||
			strings.Contains(err.Error(), "approval system must be enabled") ||
			strings.Contains(err.Error(), "only root users") ||
			strings.Contains(err.Error(), "only admin and root users can be set as approvers") {
			ctx.JSON(http.StatusForbidden, entity.NewAppError(entity.ErrCodeValidation, err.Error()))
			return
		}
		ctx.JSON(http.StatusBadRequest, entity.NewAppError(entity.ErrCodeValidation, err.Error()))
		return
	}

	// Buscar os approvers atualizados do team
	approvers, err := h.approvalUseCase.GetTeamApprovers(ctx.Request.Context(), teamID)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, err.Error()))
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"data": approvers,
	})
}

// GetTeamApprovers lista aprovadores de um team
func (h *ApprovalHandler) GetTeamApprovers(ctx *gin.Context) {
	teamID := ctx.Param("id")
	if teamID == "" {
		ctx.JSON(http.StatusBadRequest, entity.NewAppError(entity.ErrCodeValidation, "team ID is required"))
		return
	}

	approvers, err := h.approvalUseCase.GetTeamApprovers(ctx.Request.Context(), teamID)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, err.Error()))
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message": "team approvers retrieved successfully",
		"data":    approvers,
	})
}

// GetMyApproverTeams lista teams onde o usuário é aprovador
func (h *ApprovalHandler) GetMyApproverTeams(ctx *gin.Context) {
	userInterface, exists := ctx.Get("user")
	if !exists {
		ctx.JSON(http.StatusUnauthorized, entity.NewAppError(entity.ErrCodeValidation, "user not authenticated"))
		return
	}

	user, ok := userInterface.(*entity.User)
	if !ok {
		ctx.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, "invalid user context"))
		return
	}

	userID := user.ID

	teams, err := h.approvalUseCase.GetUserApproverTeams(ctx.Request.Context(), userID)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, err.Error()))
		return
	}

	// Debug logging para identificar quando retorna vazio
	log.Printf("[DEBUG] GetMyApproverTeams: UserID=%s, TeamsFound=%d, Teams=%v, Timestamp=%d", userID, len(teams), teams, ctx.Request.Context().Value("timestamp"))

	ctx.JSON(http.StatusOK, gin.H{
		"message": "user approver teams retrieved successfully",
		"data":    teams,
	})
}

// ============================
// Estatísticas
// ============================

// GetApprovalStats retorna estatísticas gerais de aprovação (root) ou escopadas aos próprios
// teams (qualquer outro role) — mesma regra de visibilidade do History.
func (h *ApprovalHandler) GetApprovalStats(ctx *gin.Context) {
	user := getUserFromSession(ctx)
	if user == nil {
		ctx.JSON(http.StatusUnauthorized, entity.NewAppError(entity.ErrCodeValidation, "user not authenticated"))
		return
	}

	stats, err := h.approvalUseCase.GetApprovalStats(ctx.Request.Context(), user)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, err.Error()))
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message": "approval stats retrieved successfully",
		"data":    stats,
	})
}

// GetApprovalStatsByTeam retorna estatísticas de um team — requer que o caller seja membro do
// team (ou root).
func (h *ApprovalHandler) GetApprovalStatsByTeam(ctx *gin.Context) {
	user := getUserFromSession(ctx)
	if user == nil {
		ctx.JSON(http.StatusUnauthorized, entity.NewAppError(entity.ErrCodeValidation, "user not authenticated"))
		return
	}

	teamID := ctx.Param("id")
	if teamID == "" {
		ctx.JSON(http.StatusBadRequest, entity.NewAppError(entity.ErrCodeValidation, "team ID is required"))
		return
	}

	stats, err := h.approvalUseCase.GetApprovalStatsByTeam(ctx.Request.Context(), teamID, user)
	if err != nil {
		if errors.Is(err, usecase.ErrApprovalAccessDenied) {
			ctx.JSON(http.StatusForbidden, entity.NewAppError(entity.ErrCodeValidation, err.Error()))
			return
		}
		ctx.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, err.Error()))
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message": "team approval stats retrieved successfully",
		"data":    stats,
	})
}

// ============================
// Utilidades
// ============================

// CheckApprovalRequired verifica se uma ação precisa aprovação
func (h *ApprovalHandler) CheckApprovalRequired(ctx *gin.Context) {
	actionTypeStr := ctx.Query("action_type")
	if actionTypeStr == "" {
		ctx.JSON(http.StatusBadRequest, entity.NewAppError(entity.ErrCodeValidation, "action_type query parameter is required"))
		return
	}

	actionType := entity.ApprovalActionType(actionTypeStr)
	required, err := h.approvalUseCase.RequiresApproval(ctx.Request.Context(), actionType)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, err.Error()))
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message": "approval requirement checked",
		"data": gin.H{
			"action_type": actionType,
			"required":    required,
		},
	})
}

// IsApprovalEnabled verifica se o sistema de aprovação está habilitado
func (h *ApprovalHandler) IsApprovalEnabled(ctx *gin.Context) {
	enabled, err := h.approvalUseCase.IsApprovalEnabled(ctx.Request.Context())
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, err.Error()))
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message": "approval status checked",
		"data": gin.H{
			"enabled": enabled,
		},
	})
}

// MarkExpiredRequests marca requests expirados
func (h *ApprovalHandler) MarkExpiredRequests(ctx *gin.Context) {
	err := h.approvalUseCase.MarkExpiredRequests(ctx.Request.Context())
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, err.Error()))
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message": "expired requests marked successfully",
	})
}

// ExecuteApprovedAction executa uma ação que foi aprovada — mesmo portão de acesso de
// approve/reject (root ou aprovador do team dono do request).
func (h *ApprovalHandler) ExecuteApprovedAction(ctx *gin.Context) {
	user := getUserFromSession(ctx)
	if user == nil {
		ctx.JSON(http.StatusUnauthorized, entity.NewAppError(entity.ErrCodeValidation, "user not authenticated"))
		return
	}

	requestID := ctx.Param("id")
	if requestID == "" {
		ctx.JSON(http.StatusBadRequest, entity.NewAppError(entity.ErrCodeValidation, "request ID is required"))
		return
	}

	err := h.approvalUseCase.ExecuteApprovedAction(ctx.Request.Context(), requestID, user)
	if err != nil {
		if errors.Is(err, usecase.ErrApprovalAccessDenied) {
			ctx.JSON(http.StatusForbidden, entity.NewAppError(entity.ErrCodeValidation, err.Error()))
			return
		}
		ctx.JSON(http.StatusBadRequest, entity.NewAppError(entity.ErrCodeValidation, err.Error()))
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message": "approved action executed successfully",
	})
}

// ============================
// Funções auxiliares
// ============================

func getUserIDFromSession(ctx *gin.Context) string {
	if user := getUserFromSession(ctx); user != nil {
		return user.ID
	}
	return ""
}

// getUserFromSession returns the authenticated caller set by ValidateToken(). Every
// access-controlled approval method needs the full user (not just its ID) to run the
// root/approver/membership check in domain/policy.
func getUserFromSession(ctx *gin.Context) *entity.User {
	if userInterface, exists := ctx.Get("user"); exists {
		if user, ok := userInterface.(*entity.User); ok {
			return user
		}
	}
	return nil
}
