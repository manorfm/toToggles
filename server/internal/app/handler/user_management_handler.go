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
	userUseCase     *usecase.UserUseCase
	teamUseCase     *usecase.TeamUseCase
	approvalUseCase *usecase.ApprovalUseCase
}

func NewUserManagementHandler(userUseCase *usecase.UserUseCase, teamUseCase *usecase.TeamUseCase, approvalUseCase *usecase.ApprovalUseCase) *UserManagementHandler {
	return &UserManagementHandler{
		userUseCase:     userUseCase,
		teamUseCase:     teamUseCase,
		approvalUseCase: approvalUseCase,
	}
}

// CreateUserManagementRequest representa a requisição de criação de usuário. Confirmado no
// protótipo (get_full_jsx("UserModal")): time é escolhido na própria criação (não é mais um
// passo separado), e "Aprovador do time" só existe quando quem cria é root criando um admin —
// o handler reforça essa regra no servidor, não confia só no que o client mandou.
type CreateUserManagementRequest struct {
	Username   string `json:"username" binding:"required"`
	Role       string `json:"role" binding:"required"`
	TeamID     string `json:"team_id" binding:"required"`
	IsApprover bool   `json:"is_approver,omitempty"`
}

// CreateUserManagementResponse representa a resposta da criação de usuário
type CreateUserManagementResponse struct {
	Success  bool         `json:"success"`
	User     *entity.User `json:"user,omitempty"`
	Password string       `json:"password,omitempty"` // Senha temporária gerada
	Error    string       `json:"error,omitempty"`
	// Warning é preenchido quando o usuário foi criado com sucesso mas associá-lo ao time (ou
	// marcá-lo aprovador) falhou depois — não desfazemos a criação por isso, mesmo padrão de
	// "team_warnings" já usado em UpdateUser.
	Warning string `json:"warning,omitempty"`
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

// CreateUser cria um novo usuário. Root e admin podem criar (RequireAdmin() na rota) — admin
// fica restrito aos times de que já participa, verificado aqui no servidor (nunca confiar só na
// UI escondendo a opção). Confirmado no protótipo (get_full_jsx("UserModal")).
func (h *UserManagementHandler) CreateUser(c *gin.Context) {
	var req CreateUserManagementRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, CreateUserManagementResponse{
			Success: false,
			Error:   "Invalid request format",
		})
		return
	}

	currentUserInterface, _ := c.Get("user")
	currentUser := currentUserInterface.(*entity.User)

	// Validar que não está tentando criar outro root
	if req.Role == "root" {
		c.JSON(http.StatusBadRequest, CreateUserManagementResponse{
			Success: false,
			Error:   "Cannot create additional root users",
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

	// Time precisa existir
	if _, err := h.teamUseCase.GetTeamByID(req.TeamID); err != nil {
		c.JSON(http.StatusBadRequest, CreateUserManagementResponse{
			Success: false,
			Error:   "Team not found",
		})
		return
	}

	// Admin só cria em times de que já participa — root pode em qualquer time.
	if !currentUser.IsRoot() && !currentUser.IsMemberOfTeam(req.TeamID) {
		c.JSON(http.StatusForbidden, CreateUserManagementResponse{
			Success: false,
			Error:   "Admins can only create users in teams they belong to",
		})
		return
	}

	// "Aprovador do time" na criação só é uma opção real quando root cria um admin — reforçado
	// aqui mesmo que o client não tenha escondido o campo.
	makeApprover := req.IsApprover && currentUser.IsRoot() && userRole == entity.UserRoleAdmin

	// Gerar senha aleatória
	randomPassword, err := entity.GenerateRandomPassword()
	if err != nil {
		c.JSON(http.StatusInternalServerError, CreateUserManagementResponse{
			Success: false,
			Error:   "Failed to generate password",
		})
		return
	}

	// Criar usuário
	user := &entity.User{
		Username:           req.Username,
		Role:               userRole,
		MustChangePassword: true, // Obriga troca de senha no primeiro login
		Active:             true,
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
		status := http.StatusInternalServerError
		if appErr, ok := err.(*entity.AppError); ok && appErr.Code == entity.ErrCodeAlreadyExists {
			status = http.StatusConflict
		}
		c.JSON(status, CreateUserManagementResponse{
			Success: false,
			Error:   "Failed to create user: " + err.Error(),
		})
		return
	}
	user.RefreshStatus()

	// Associar ao time e (opcionalmente) marcar aprovador — best-effort: o usuário já existe,
	// não desfazemos a criação se isso falhar, só avisamos (mesmo padrão de UpdateUser).
	var warning string
	if err := h.teamUseCase.AddUserToTeam(req.TeamID, user.ID); err != nil {
		warning = "User created, but failed to add to the team: " + err.Error()
	} else if makeApprover {
		if err := h.approvalUseCase.SetTeamApprover(c.Request.Context(), req.TeamID, user.ID, true, currentUser.ID); err != nil {
			warning = "User created and added to the team, but failed to set as approver: " + err.Error()
		}
	}

	c.JSON(http.StatusCreated, CreateUserManagementResponse{
		Success:  true,
		User:     user,
		Password: randomPassword, // Retorna a senha temporária
		Warning:  warning,
	})
}

// ListUsers lista usuários — root vê todos; admin só vê a si mesmo e quem compartilha pelo
// menos um time consigo (sem isso, "criar usuário" não teria como conferir o resultado).
func (h *UserManagementHandler) ListUsers(c *gin.Context) {
	users, err := h.userUseCase.GetAllUsers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, ListUsersResponse{
			Success: false,
			Error:   "Failed to retrieve users: " + err.Error(),
		})
		return
	}

	currentUserInterface, _ := c.Get("user")
	currentUser := currentUserInterface.(*entity.User)
	if !currentUser.IsRoot() {
		users = filterUsersVisibleToAdmin(users, currentUser)
	}

	c.JSON(http.StatusOK, ListUsersResponse{
		Success: true,
		Users:   users,
	})
}

func filterUsersVisibleToAdmin(users []entity.User, admin *entity.User) []entity.User {
	myTeamIDs := make(map[string]bool, len(admin.Teams))
	for _, t := range admin.Teams {
		myTeamIDs[t.ID] = true
	}

	visible := make([]entity.User, 0, len(users))
	for _, u := range users {
		if u.ID == admin.ID {
			visible = append(visible, u)
			continue
		}
		for _, t := range u.Teams {
			if myTeamIDs[t.ID] {
				visible = append(visible, u)
				break
			}
		}
	}
	return visible
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

// canManageUser espelha o canManageUser() real do protótipo (decodificado do bundle
// comprimido em docs/toToggle.html — mesma técnica documentada no header de
// lib/toggleLeaves.ts no frontend): root gerencia qualquer um exceto root/si mesmo; admin
// gerencia qualquer um (inclusive outro admin) que compartilhe pelo menos um time consigo,
// exceto root/si mesmo; "user" não gerencia ninguém.
func canManageUser(currentUser, target *entity.User) bool {
	if target.IsRoot() || target.ID == currentUser.ID {
		return false
	}
	if currentUser.IsRoot() {
		return true
	}
	if !currentUser.IsAdmin() {
		return false
	}
	myTeamIDs := make(map[string]bool, len(currentUser.Teams))
	for _, t := range currentUser.Teams {
		myTeamIDs[t.ID] = true
	}
	for _, t := range target.Teams {
		if myTeamIDs[t.ID] {
			return true
		}
	}
	return false
}

// ResetPasswordResponse é a resposta de ResetUserPassword — mesmo shape de
// CreateUserManagementResponse.Password: senha em texto puro, mostrada uma única vez
// (confirmado no protótipo: TempPasswordModal com reset=true, "Senha provisória redefinida").
type ResetPasswordResponse struct {
	Success  bool         `json:"success"`
	User     *entity.User `json:"user,omitempty"`
	Password string       `json:"password,omitempty"`
	Error    string       `json:"error,omitempty"`
}

// ResetUserPassword gera uma nova senha provisória pra um usuário existente — root gerencia
// qualquer um, admin só quem compartilha um time consigo (canManageUser, confirmado no
// protótipo). É o equivalente seguro do "Ver senha" do protótipo: lá a senha continua legível
// porque é tudo estado em memória; aqui só guardamos o hash bcrypt, então reexibir a senha JÁ
// mostrada nunca é possível — resetar (invalidando a anterior) é o único caminho real.
func (h *UserManagementHandler) ResetUserPassword(c *gin.Context) {
	userID := c.Param("id")
	if userID == "" {
		c.JSON(http.StatusBadRequest, ResetPasswordResponse{Success: false, Error: "User ID is required"})
		return
	}

	user, err := h.userUseCase.GetUserByID(userID)
	if err != nil {
		c.JSON(http.StatusNotFound, ResetPasswordResponse{Success: false, Error: "User not found"})
		return
	}

	currentUserInterface, _ := c.Get("user")
	currentUser := currentUserInterface.(*entity.User)
	if !canManageUser(currentUser, user) {
		c.JSON(http.StatusForbidden, ResetPasswordResponse{Success: false, Error: "You cannot manage this user"})
		return
	}

	randomPassword, err := entity.GenerateRandomPassword()
	if err != nil {
		c.JSON(http.StatusInternalServerError, ResetPasswordResponse{Success: false, Error: "Failed to generate password"})
		return
	}

	if err := user.SetPassword(randomPassword); err != nil {
		c.JSON(http.StatusInternalServerError, ResetPasswordResponse{Success: false, Error: "Failed to set password"})
		return
	}
	user.MustChangePassword = true

	if err := h.userUseCase.UpdateUser(user); err != nil {
		c.JSON(http.StatusInternalServerError, ResetPasswordResponse{Success: false, Error: "Failed to update user: " + err.Error()})
		return
	}
	// Reset de senha é a resposta padrão a uma conta possivelmente comprometida — qualquer
	// sessão existente do alvo deve morrer junto, não só a senha antiga.
	_ = h.userUseCase.InvalidateSessions(userID)
	user.RefreshStatus()

	c.JSON(http.StatusOK, ResetPasswordResponse{Success: true, User: user, Password: randomPassword})
}

// SetUserStatusRequest é o corpo de SetUserStatus.
type SetUserStatusRequest struct {
	Active bool `json:"active"`
}

// SetUserStatus desativa/reativa um usuário — mesmo escopo de ResetUserPassword
// (canManageUser): root gerencia qualquer um, admin só quem compartilha um time consigo.
// Desativado bloqueia login sem apagar a conta (StatusPill "disabled" no protótipo). Ninguém
// gerencia a si mesmo nem o root (canManageUser já cobre isso), o que também garante "não dá
// pra se autodesativar".
func (h *UserManagementHandler) SetUserStatus(c *gin.Context) {
	userID := c.Param("id")
	if userID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "User ID is required"})
		return
	}

	var req SetUserStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request format"})
		return
	}

	user, err := h.userUseCase.GetUserByID(userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "User not found"})
		return
	}

	currentUserInterface, _ := c.Get("user")
	currentUser := currentUserInterface.(*entity.User)
	if !canManageUser(currentUser, user) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "error": "You cannot manage this user"})
		return
	}

	user.Active = req.Active
	if err := h.userUseCase.UpdateUser(user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to update user: " + err.Error()})
		return
	}
	user.RefreshStatus()

	c.JSON(http.StatusOK, gin.H{"success": true, "user": user})
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
	Role          string   `json:"role"`
	TeamsToAdd    []string `json:"teams_to_add,omitempty"`
	TeamsToRemove []string `json:"teams_to_remove,omitempty"`
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
