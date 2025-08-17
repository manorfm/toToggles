package handler

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/usecase"
)

type UserManagementHandler struct {
	userUseCase *usecase.UserUseCase
	teamUseCase *usecase.TeamUseCase
}

func NewUserManagementHandler(userUseCase *usecase.UserUseCase, teamUseCase *usecase.TeamUseCase) *UserManagementHandler {
	return &UserManagementHandler{
		userUseCase: userUseCase,
		teamUseCase: teamUseCase,
	}
}

// CreateUserManagementRequest representa a requisição de criação de usuário
type CreateUserManagementRequest struct {
	Username string            `json:"username" binding:"required"`
	Role     string            `json:"role" binding:"required"`
}

// CreateUserManagementResponse representa a resposta da criação de usuário
type CreateUserManagementResponse struct {
	Success     bool        `json:"success"`
	User        *entity.User `json:"user,omitempty"`
	Password    string      `json:"password,omitempty"` // Senha temporária gerada
	Error       string      `json:"error,omitempty"`
}

// ChangePasswordManagementRequest representa a requisição de troca de senha
type ChangePasswordManagementRequest struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password" binding:"required"`
}

// ListUsersResponse representa a resposta da listagem de usuários
type ListUsersResponse struct {
	Success bool          `json:"success"`
	Users   []entity.User `json:"users,omitempty"`
	Error   string        `json:"error,omitempty"`
}

// CreateUser cria um novo usuário (apenas root pode criar usuários)
func (h *UserManagementHandler) CreateUser(c *gin.Context) {
	var req CreateUserManagementRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, CreateUserManagementResponse{
			Success: false,
			Error:   "Invalid request format",
		})
		return
	}

	// Validar que não está tentando criar outro root
	if req.Role == "root" {
		c.JSON(http.StatusBadRequest, CreateUserManagementResponse{
			Success: false,
			Error:   "Cannot create additional root users",
		})
		return
	}

	// Gerar senha aleatória
	randomPassword, err := entity.GenerateRandomPassword()
	if err != nil {
		c.JSON(http.StatusInternalServerError, CreateUserManagementResponse{
			Success: false,
			Error:   "Failed to generate password",
		})
		return
	}

	// Converter string para UserRole
	var userRole entity.UserRole
	switch req.Role {
	case "admin":
		userRole = entity.UserRoleAdmin
	case "user":
		userRole = entity.UserRoleUser
	default:
		c.JSON(http.StatusBadRequest, CreateUserManagementResponse{
			Success: false,
			Error:   "Invalid role. Must be 'admin' or 'user'",
		})
		return
	}

	// Criar usuário
	user := &entity.User{
		Username:           req.Username,
		Role:               userRole,
		MustChangePassword: true, // Obriga troca de senha no primeiro login
	}

	err = user.SetPassword(randomPassword)
	if err != nil {
		c.JSON(http.StatusInternalServerError, CreateUserManagementResponse{
			Success: false,
			Error:   "Failed to set password",
		})
		return
	}

	// Validar dados do usuário
	if err := user.Validate(); err != nil {
		c.JSON(http.StatusBadRequest, CreateUserManagementResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	// Salvar no banco de dados
	err = h.userUseCase.CreateUser(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, CreateUserManagementResponse{
			Success: false,
			Error:   "Failed to create user: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, CreateUserManagementResponse{
		Success:  true,
		User:     user,
		Password: randomPassword, // Retorna a senha temporária
	})
}

// ListUsers lista todos os usuários (apenas root pode listar usuários)
func (h *UserManagementHandler) ListUsers(c *gin.Context) {
	users, err := h.userUseCase.GetAllUsers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, ListUsersResponse{
			Success: false,
			Error:   "Failed to retrieve users: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, ListUsersResponse{
		Success: true,
		Users:   users,
	})
}

// GetUser retorna um usuário específico com seus teams (apenas root pode acessar)
func (h *UserManagementHandler) GetUser(c *gin.Context) {
	userID := c.Param("id")
	if userID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "User ID is required",
		})
		return
	}

	user, err := h.userUseCase.GetUserByID(userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"error":   "User not found",
		})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"user":    user,
	})
}

// DeleteUser remove um usuário (apenas root pode deletar usuários)
func (h *UserManagementHandler) DeleteUser(c *gin.Context) {
	userID := c.Param("id")
	if userID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "User ID is required",
		})
		return
	}

	// Verificar se o usuário a ser deletado existe
	userToDelete, err := h.userUseCase.GetUserByID(userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"error":   "User not found",
		})
		return
	}

	// Impedir a exclusão do usuário root
	if userToDelete.IsRoot() {
		c.JSON(http.StatusForbidden, gin.H{
			"success": false,
			"error":   "Cannot delete root user",
		})
		return
	}

	// Impedir que o root delete a si mesmo
	currentUserInterface, _ := c.Get("user")
	currentUser := currentUserInterface.(*entity.User)
	if currentUser.ID == userID {
		c.JSON(http.StatusForbidden, gin.H{
			"success": false,
			"error":   "Cannot delete your own user account",
		})
		return
	}

	// Deletar usuário
	err = h.userUseCase.DeleteUser(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to delete user: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "User deleted successfully",
	})
}

// ChangePassword permite que um usuário altere sua própria senha
func (h *UserManagementHandler) ChangePassword(c *gin.Context) {
	var req ChangePasswordManagementRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request format",
		})
		return
	}

	// Obter usuário do contexto
	userInterface, _ := c.Get("user")
	user := userInterface.(*entity.User)

	// Verificar senha atual
	if !user.CheckPassword(req.CurrentPassword) {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"error":   "Current password is incorrect",
		})
		return
	}

	// Definir nova senha
	err := user.SetPassword(req.NewPassword)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	// Marcar que não precisa mais trocar a senha
	user.MustChangePassword = false

	// Salvar alterações
	err = h.userUseCase.UpdateUser(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to update password: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Password changed successfully",
	})
}

// UpdateUserManagementRequest representa a requisição de atualização de usuário
type UpdateUserManagementRequest struct {
	Role           string   `json:"role"`
	TeamsToAdd     []string `json:"teams_to_add,omitempty"`
	TeamsToRemove  []string `json:"teams_to_remove,omitempty"`
}

// UpdateUser atualiza um usuário (apenas root pode atualizar usuários)
func (h *UserManagementHandler) UpdateUser(c *gin.Context) {
	userID := c.Param("id")
	if userID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "User ID is required",
		})
		return
	}

	var req UpdateUserManagementRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request format",
		})
		return
	}

	// Verificar se o usuário a ser atualizado existe
	userToUpdate, err := h.userUseCase.GetUserByID(userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"error":   "User not found",
		})
		return
	}

	// Obter usuário atual do contexto
	currentUserInterface, _ := c.Get("user")
	currentUser := currentUserInterface.(*entity.User)

	// Regra especial para usuário root: apenas o próprio root pode manter seu role como root
	if req.Role == "root" {
		// Apenas permitir se for o próprio root editando a si mesmo
		if !currentUser.IsRoot() || currentUser.ID != userID {
			c.JSON(http.StatusForbidden, gin.H{
				"success": false,
				"error":   "Only the root user can maintain root role for themselves",
			})
			return
		}
		// Se chegou aqui, é o próprio root editando a si mesmo, permitir
	} else {
		// Para outros roles, não permitir alteração se o usuário alvo é root (a menos que seja o próprio root mudando para outro role)
		if userToUpdate.IsRoot() && !(currentUser.IsRoot() && currentUser.ID == userID) {
			c.JSON(http.StatusForbidden, gin.H{
				"success": false,
				"error":   "Cannot modify root user role",
			})
			return
		}
	}

	// Converter string para UserRole
	var userRole entity.UserRole
	switch req.Role {
	case "admin":
		userRole = entity.UserRoleAdmin
	case "user":
		userRole = entity.UserRoleUser
	case "root":
		userRole = entity.UserRoleRoot
	default:
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid role. Must be 'admin', 'user', or 'root'",
		})
		return
	}

	// Atualizar role
	userToUpdate.Role = userRole

	// Salvar alterações
	err = h.userUseCase.UpdateUser(userToUpdate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to update user: " + err.Error(),
		})
		return
	}

	// Processar associações de teams
	var teamErrors []string
	
	if len(req.TeamsToRemove) > 0 {
		for _, teamID := range req.TeamsToRemove {
			err = h.teamUseCase.RemoveUserFromTeam(teamID, userID)
			if err != nil {
				teamErrors = append(teamErrors, fmt.Sprintf("Failed to remove from team %s: %v", teamID, err))
			}
		}
	}

	if len(req.TeamsToAdd) > 0 {
		for _, teamID := range req.TeamsToAdd {
			err = h.teamUseCase.AddUserToTeam(teamID, userID)
			if err != nil {
				// Se erro for "já é membro", ignorar (não é um erro real)
				if !strings.Contains(err.Error(), "already a member") {
					teamErrors = append(teamErrors, fmt.Sprintf("Failed to add to team %s: %v", teamID, err))
				}
			}
		}
	}

	// Recarregar usuário com teams atualizados
	updatedUser, err := h.userUseCase.GetUserByID(userID)
	if err != nil {
		// Se falhar ao recarregar, ainda retorna sucesso mas sem teams
		responseData := gin.H{
			"success": true,
			"message": "User updated successfully",
			"user":    userToUpdate,
		}
		if len(teamErrors) > 0 {
			responseData["team_warnings"] = teamErrors
		}
		c.JSON(http.StatusOK, responseData)
		return
	}

	responseData := gin.H{
		"success": true,
		"message": "User updated successfully",
		"user":    updatedUser,
	}
	if len(teamErrors) > 0 {
		responseData["team_warnings"] = teamErrors
	}
	c.JSON(http.StatusOK, responseData)
}

// GetCurrentUser retorna informações do usuário atual
func (h *UserManagementHandler) GetCurrentUser(c *gin.Context) {
	userInterface, _ := c.Get("user")
	user := userInterface.(*entity.User)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"user": gin.H{
			"id":                   user.ID,
			"username":             user.Username,
			"role":                 user.Role,
			"must_change_password": user.MustChangePassword,
			"created_at":           user.CreatedAt,
			"updated_at":           user.UpdatedAt,
		},
	})
}