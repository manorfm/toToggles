package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/usecase"
)

type AuthHandler struct {
	authUseCase *usecase.AuthUseCase
}

func NewAuthHandler(authUseCase *usecase.AuthUseCase) *AuthHandler {
	return &AuthHandler{
		authUseCase: authUseCase,
	}
}

// LoginRequest representa os dados de login
type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// LoginResponse representa a resposta do login
type LoginResponse struct {
	Success bool   `json:"success"`
	Token   string `json:"token,omitempty"`
	User    gin.H  `json:"user,omitempty"`
	Error   string `json:"error,omitempty"`
}

// Login realiza a autenticação do usuário
func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, LoginResponse{
			Success: false,
			Error:   "Invalid request format",
		})
		return
	}

	result, err := h.authUseCase.Login(req.Username, req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, LoginResponse{
			Success: false,
			Error:   "Internal server error",
		})
		return
	}

	if !result.Success {
		c.JSON(http.StatusUnauthorized, LoginResponse{
			Success: false,
			Error:   result.Error,
		})
		return
	}

	// Se o usuário precisa trocar a senha, não gerar token de autenticação
	if result.User.MustChangePassword {
		// Retornar resposta indicando que precisa trocar senha
		c.JSON(http.StatusOK, gin.H{
			"success":              true,
			"must_change_password": true,
			"user_id":             result.User.ID,
			"username":            result.User.Username,
			"message":             "Password change required before login",
		})
		return
	}

	// Retornar dados do usuário sem informações sensíveis
	userResponse := gin.H{
		"id":                   result.User.ID,
		"username":             result.User.Username,
		"role":                 result.User.Role,
		"must_change_password": result.User.MustChangePassword,
	}

	// Set secure HTTP-only cookie
	c.SetSameSite(http.SameSiteStrictMode)
	c.SetCookie(
		"auth_token",     // cookie name
		result.Token,     // cookie value
		3600*24*7,       // max age in seconds (7 days)
		"/",             // path
		"",              // domain (empty for current domain)
		false,           // secure (set to true in production with HTTPS)
		true,            // httpOnly
	)

	c.JSON(http.StatusOK, LoginResponse{
		Success: true,
		User:    userResponse,
	})
}

// Logout realiza o logout do usuário
func (h *AuthHandler) Logout(c *gin.Context) {
	// Clear the auth cookie
	c.SetCookie(
		"auth_token",  // cookie name
		"",           // empty value
		-1,           // max age -1 deletes the cookie
		"/",          // path
		"",           // domain
		false,        // secure
		true,         // httpOnly
	)
	
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Logged out successfully",
	})
}

// ChangePasswordFirstTime permite mudança de senha para usuários que precisam trocar senha (sem token)
func (h *AuthHandler) ChangePasswordFirstTime(c *gin.Context) {
	var req struct {
		UserID          string `json:"user_id" binding:"required"`
		Username        string `json:"username" binding:"required"`
		CurrentPassword string `json:"current_password" binding:"required"`
		NewPassword     string `json:"new_password" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request data",
		})
		return
	}

	// Validar se o usuário existe e a senha atual está correta
	result, err := h.authUseCase.Authenticate(req.Username, req.CurrentPassword)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"error":   "Invalid current password",
		})
		return
	}

	// Verificar se o user_id corresponde
	if result.User.ID != req.UserID {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"error":   "Invalid user data",
		})
		return
	}

	// Verificar se o usuário realmente precisa trocar a senha
	if !result.User.MustChangePassword {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Password change not required for this user",
		})
		return
	}

	// Atualizar a senha e remover a flag MustChangePassword
	err = h.authUseCase.ChangePasswordFirstTime(req.UserID, req.NewPassword)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to update password",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Password changed successfully",
	})
}

// CheckFirstAccess verifica se é o primeiro acesso ao sistema (não existem usuários)
func (h *AuthHandler) CheckFirstAccess(c *gin.Context) {
	userCount, err := h.authUseCase.GetUserCount()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to check system status",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"first_access": userCount == 0,
		"user_count":   userCount,
	})
}

// ValidateToken middleware para validar tokens
func (h *AuthHandler) ValidateToken() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Try to get token from cookie first (secure method)
		token, err := c.Cookie("auth_token")
		if err != nil || token == "" {
			// Fallback to Authorization header for API compatibility
			authHeader := c.GetHeader("Authorization")
			if len(authHeader) > 7 && authHeader[:7] == "Bearer " {
				token = authHeader[7:]
			}
		}

		if token == "" {
			// Clear any invalid cookie
			c.SetCookie("auth_token", "", -1, "/", "", false, true)
			
			// Se é uma requisição para a página principal, redirecionar para login
			if c.Request.URL.Path == "/" {
				c.Redirect(http.StatusTemporaryRedirect, "/login")
				c.Abort()
				return
			}
			// Para APIs, retornar JSON
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Authorization token required",
			})
			c.Abort()
			return
		}

		user, err := h.authUseCase.ValidateToken(token)
		if err != nil {
			// Clear invalid cookie
			c.SetCookie("auth_token", "", -1, "/", "", false, true)
			
			// Se é uma requisição para a página principal, redirecionar para login
			if c.Request.URL.Path == "/" {
				c.Redirect(http.StatusTemporaryRedirect, "/login")
				c.Abort()
				return
			}
			// Para APIs, retornar JSON
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Invalid token",
			})
			c.Abort()
			return
		}

		// Adicionar usuário ao contexto
		c.Set("user", user)
		
		// Verificar se precisa trocar a senha (exceto na própria rota de troca de senha)
		if user.MustChangePassword && c.Request.URL.Path != "/auth/change-password" && c.Request.URL.Path != "/change-password" {
			// Se é uma requisição para a página principal, redirecionar para troca de senha
			if c.Request.URL.Path == "/" || c.Request.URL.Path == "/dashboard" {
				c.Redirect(http.StatusTemporaryRedirect, "/change-password")
				c.Abort()
				return
			}
			// Para APIs, retornar status especial
			c.JSON(http.StatusPreconditionRequired, gin.H{
				"error": "Password change required",
				"redirect": "/change-password",
			})
			c.Abort()
			return
		}
		
		c.Next()
	}
}

// ValidatePasswordChangeAccess middleware para validar acesso à página de mudança de senha
func (h *AuthHandler) ValidatePasswordChangeAccess() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Para acesso à página de mudança de senha, verificamos se há um cookie de token
		token, err := c.Cookie("auth_token")
		
		if err == nil {
			// Se há token, verificar se o usuário precisa trocar senha
			user, err := h.authUseCase.ValidateToken(token)
			if err == nil && user.MustChangePassword {
				// Usuário autenticado que precisa trocar senha - permitir acesso
				c.Next()
				return
			}
			
			// Se há token válido mas não precisa trocar senha, redirecionar para home
			if err == nil && !user.MustChangePassword {
				c.Redirect(http.StatusTemporaryRedirect, "/")
				c.Abort()
				return
			}
		}
		
		// Se não há token ou token inválido, verificar se chegou aqui via fluxo de login
		// A página em si fará a validação pelo sessionStorage
		// Se não há dados válidos no sessionStorage, o JavaScript redirecionará para login
		c.Next()
	}
}

// RequireRoot middleware que requer privilégios de root (gerenciamento de usuários)
func (h *AuthHandler) RequireRoot() gin.HandlerFunc {
	return func(c *gin.Context) {
		userInterface, exists := c.Get("user")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "User not authenticated",
			})
			c.Abort()
			return
		}

		user, ok := userInterface.(*entity.User)
		if !ok || !user.IsRoot() {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "Root privileges required",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// RequireAdmin middleware que requer privilégios de admin ou superior
func (h *AuthHandler) RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		userInterface, exists := c.Get("user")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "User not authenticated",
			})
			c.Abort()
			return
		}

		user, ok := userInterface.(*entity.User)
		if !ok || (!user.IsAdmin() && !user.IsRoot()) {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "Admin privileges required",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// RequireModifyPermission middleware que requer permissão de modificação
func (h *AuthHandler) RequireModifyPermission() gin.HandlerFunc {
	return func(c *gin.Context) {
		userInterface, exists := c.Get("user")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "User not authenticated",
			})
			c.Abort()
			return
		}

		user, ok := userInterface.(*entity.User)
		if !ok || !user.CanModifyData() {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "Modification privileges required",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// RequireApplicationAccess middleware que verifica acesso a uma aplicação via teams
func RequireApplicationAccess(permission entity.TeamPermissionLevel) gin.HandlerFunc {
	return func(c *gin.Context) {
		userInterface, exists := c.Get("user")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "User not authenticated",
			})
			c.Abort()
			return
		}

		user, ok := userInterface.(*entity.User)
		if !ok {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Invalid user data in context",
			})
			c.Abort()
			return
		}

		// Root sempre tem acesso
		if user.IsRoot() {
			c.Next()
			return
		}

		// Obter ID da aplicação do contexto da rota
		applicationID := c.Param("id")
		if applicationID == "" {
			applicationID = c.Param("app_id")
		}

		if applicationID == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Application ID is required",
			})
			c.Abort()
			return
		}

		// Verificar permissões através dos teams (via use case seria melhor, 
		// mas para middleware simples, faremos direto)
		// TODO: Implementar verificação de permissões via teams
		// Por enquanto, usar as permissões antigas baseadas em role
		if permission == entity.PermissionWrite && !user.CanModifyData() {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "Write permission required",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}