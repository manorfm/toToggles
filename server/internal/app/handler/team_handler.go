package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/usecase"
)

type TeamHandler struct {
	teamUseCase *usecase.TeamUseCase
}

func NewTeamHandler(teamUseCase *usecase.TeamUseCase) *TeamHandler {
	return &TeamHandler{
		teamUseCase: teamUseCase,
	}
}

// Estruturas de Request/Response

type CreateTeamRequest struct {
	Name        string `json:"name" binding:"required"`
	Description string `json:"description"`
}

type UpdateTeamRequest struct {
	Name        string `json:"name" binding:"required"`
	Description string `json:"description"`
}

type AddUserToTeamRequest struct {
	UserID string `json:"user_id" binding:"required"`
}

type AddApplicationToTeamRequest struct {
	ApplicationID string `json:"application_id" binding:"required"`
	Permission    string `json:"permission" binding:"required"`
}

type UpdateApplicationPermissionRequest struct {
	Permission string `json:"permission" binding:"required"`
}

type TeamResponse struct {
	Success bool        `json:"success"`
	Team    *entity.Team `json:"team,omitempty"`
	Error   string      `json:"error,omitempty"`
}

type TeamsResponse struct {
	Success bool                      `json:"success"`
	Teams   []*entity.TeamWithCounts  `json:"teams,omitempty"`
	Error   string                   `json:"error,omitempty"`
}

// CRUD Operations

// CreateTeam cria um novo time (apenas root)
func (h *TeamHandler) CreateTeam(c *gin.Context) {
	var req CreateTeamRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, TeamResponse{
			Success: false,
			Error:   "Invalid request format",
		})
		return
	}

	team := &entity.Team{
		Name:        req.Name,
		Description: req.Description,
	}

	err := h.teamUseCase.CreateTeam(team)
	if err != nil {
		c.JSON(http.StatusBadRequest, TeamResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, TeamResponse{
		Success: true,
		Team:    team,
	})
}

// GetAllTeams lista todos os times com contagens
func (h *TeamHandler) GetAllTeams(c *gin.Context) {
	teams, err := h.teamUseCase.GetAllTeamsWithCounts()
	if err != nil {
		c.JSON(http.StatusInternalServerError, TeamsResponse{
			Success: false,
			Error:   "Failed to retrieve teams: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, TeamsResponse{
		Success: true,
		Teams:   teams,
	})
}

// GetTeam obtém um time por ID
func (h *TeamHandler) GetTeam(c *gin.Context) {
	teamID := c.Param("id")
	if teamID == "" {
		c.JSON(http.StatusBadRequest, TeamResponse{
			Success: false,
			Error:   "Team ID is required",
		})
		return
	}

	team, err := h.teamUseCase.GetTeamByID(teamID)
	if err != nil {
		c.JSON(http.StatusNotFound, TeamResponse{
			Success: false,
			Error:   "Team not found",
		})
		return
	}

	c.JSON(http.StatusOK, TeamResponse{
		Success: true,
		Team:    team,
	})
}

// UpdateTeam atualiza um time (apenas root)
func (h *TeamHandler) UpdateTeam(c *gin.Context) {
	teamID := c.Param("id")
	if teamID == "" {
		c.JSON(http.StatusBadRequest, TeamResponse{
			Success: false,
			Error:   "Team ID is required",
		})
		return
	}

	var req UpdateTeamRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, TeamResponse{
			Success: false,
			Error:   "Invalid request format",
		})
		return
	}

	// Buscar time existente
	team, err := h.teamUseCase.GetTeamByID(teamID)
	if err != nil {
		c.JSON(http.StatusNotFound, TeamResponse{
			Success: false,
			Error:   "Team not found",
		})
		return
	}

	// Atualizar dados
	team.Name = req.Name
	team.Description = req.Description

	err = h.teamUseCase.UpdateTeam(team)
	if err != nil {
		c.JSON(http.StatusBadRequest, TeamResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, TeamResponse{
		Success: true,
		Team:    team,
	})
}

// DeleteTeam remove um time (apenas root)
func (h *TeamHandler) DeleteTeam(c *gin.Context) {
	teamID := c.Param("id")
	if teamID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Team ID is required",
		})
		return
	}

	err := h.teamUseCase.DeleteTeam(teamID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to delete team: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Team deleted successfully",
	})
}

// User Management

// AddUserToTeam adiciona um usuário ao time (apenas root)
func (h *TeamHandler) AddUserToTeam(c *gin.Context) {
	teamID := c.Param("id")
	if teamID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Team ID is required",
		})
		return
	}

	var req AddUserToTeamRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request format",
		})
		return
	}

	err := h.teamUseCase.AddUserToTeam(teamID, req.UserID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "User added to team successfully",
	})
}

// RemoveUserFromTeam remove um usuário do time (apenas root)
func (h *TeamHandler) RemoveUserFromTeam(c *gin.Context) {
	teamID := c.Param("id")
	userID := c.Param("user_id")

	if teamID == "" || userID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Team ID and User ID are required",
		})
		return
	}

	err := h.teamUseCase.RemoveUserFromTeam(teamID, userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "User removed from team successfully",
	})
}

// GetTeamUsers lista os usuários de um time
func (h *TeamHandler) GetTeamUsers(c *gin.Context) {
	teamID := c.Param("id")
	if teamID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Team ID is required",
		})
		return
	}

	users, err := h.teamUseCase.GetTeamUsers(teamID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to retrieve team users: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"users":   users,
	})
}

// Application Management

// AddApplicationToTeam adiciona uma aplicação ao time com permissões (apenas root)
func (h *TeamHandler) AddApplicationToTeam(c *gin.Context) {
	teamID := c.Param("id")
	if teamID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Team ID is required",
		})
		return
	}

	var req AddApplicationToTeamRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request format",
		})
		return
	}

	// Converter string para TeamPermissionLevel
	var permission entity.TeamPermissionLevel
	switch req.Permission {
	case "read":
		permission = entity.PermissionRead
	case "write":
		permission = entity.PermissionWrite
	case "admin":
		permission = entity.PermissionAdmin
	default:
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid permission. Must be 'read', 'write', or 'admin'",
		})
		return
	}

	err := h.teamUseCase.AddApplicationToTeam(teamID, req.ApplicationID, permission)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Application added to team successfully",
	})
}

// RemoveApplicationFromTeam remove uma aplicação do time (apenas root)
func (h *TeamHandler) RemoveApplicationFromTeam(c *gin.Context) {
	teamID := c.Param("id")
	applicationID := c.Param("app_id")

	if teamID == "" || applicationID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Team ID and Application ID are required",
		})
		return
	}

	err := h.teamUseCase.RemoveApplicationFromTeam(teamID, applicationID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Application removed from team successfully",
	})
}

// UpdateApplicationPermission atualiza a permissão de uma aplicação no time (apenas root)
func (h *TeamHandler) UpdateApplicationPermission(c *gin.Context) {
	teamID := c.Param("id")
	applicationID := c.Param("app_id")

	if teamID == "" || applicationID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Team ID and Application ID are required",
		})
		return
	}

	var req UpdateApplicationPermissionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request format",
		})
		return
	}

	// Converter string para TeamPermissionLevel
	var permission entity.TeamPermissionLevel
	switch req.Permission {
	case "read":
		permission = entity.PermissionRead
	case "write":
		permission = entity.PermissionWrite
	case "admin":
		permission = entity.PermissionAdmin
	default:
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid permission. Must be 'read', 'write', or 'admin'",
		})
		return
	}

	err := h.teamUseCase.UpdateApplicationPermission(teamID, applicationID, permission)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Application permission updated successfully",
	})
}

// GetTeamApplications lista as aplicações de um time
func (h *TeamHandler) GetTeamApplications(c *gin.Context) {
	teamID := c.Param("id")
	if teamID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Team ID is required",
		})
		return
	}

	applications, err := h.teamUseCase.GetTeamApplications(teamID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to retrieve team applications: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":      true,
		"applications": applications,
	})
}

// GetUserTeams retorna os times de um usuário
func (h *TeamHandler) GetUserTeams(c *gin.Context) {
	userInterface, _ := c.Get("user")
	user := userInterface.(*entity.User)

	teams, err := h.teamUseCase.GetUserTeams(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to retrieve user teams: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"teams":   teams,
	})
}