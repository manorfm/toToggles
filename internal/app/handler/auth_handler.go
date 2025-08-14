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

	// Retornar dados do usuário sem informações sensíveis
	userResponse := gin.H{
		"id":       result.User.ID,
		"username": result.User.Username,
		"role":     result.User.Role,
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
		c.Next()
	}
}

// RequireAdmin middleware que requer privilégios de admin
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
		if !ok || !user.IsAdmin() {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "Admin privileges required",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}