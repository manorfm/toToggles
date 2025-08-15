package router

import (
	"github.com/gin-gonic/gin"
	"github.com/manorfm/totoogle/internal/app/handler"
	"github.com/manorfm/totoogle/internal/app/middleware"
)

func Init(router *gin.Engine) {
	// Middlewares de segurança globais
	router.Use(middleware.SecurityHeaders())
	router.Use(middleware.CORSHeaders())
	router.Use(middleware.RequestID())

	// Middleware para servir arquivos estáticos
	router.Use(handler.ServeStatic)

	// Rotas de arquivos estáticos
	router.Static("/static", "./static")

	// Rotas públicas de autenticação
	auth := router.Group("/auth")
	{
		auth.POST("/login", handler.Login)
		auth.POST("/logout", handler.Logout)
		auth.GET("/check-first-access", handler.CheckFirstAccess)
		auth.POST("/change-password", handler.ValidateToken(), handler.ChangePassword)
		auth.POST("/change-password-first-time", handler.ChangePasswordFirstTime)
	}

	// Rotas públicas da API (acesso por secret key)
	api := router.Group("/api")
	{
		api.GET("/toggles/by-secret/:secret", handler.GetTogglesBySecret)
	}

	// Rotas protegidas que requerem autenticação
	protected := router.Group("")
	protected.Use(handler.ValidateToken())
	{
		// Rotas de aplicações
		applications := protected.Group("/applications")
		{
			applications.POST("", handler.RequireAdmin(), handler.CreateApplication)
			applications.GET("", handler.GetAllApplications) // Filtrado por permissão internamente
			applications.GET("/:id", handler.GetApplication)
			applications.PUT("/:id", handler.RequireAdmin(), handler.UpdateApplication)
			applications.DELETE("/:id", handler.RequireRoot(), handler.DeleteApplication)
			
			// Rotas de secret keys para aplicações (apenas admin/root)
			applications.POST("/:id/generate-secret", handler.RequireAdmin(), handler.GenerateSecretKey)
			applications.GET("/:id/secret-keys", handler.RequireAdmin(), handler.GetSecretKeys)
		}

		// Rotas de toggles
		toggles := protected.Group("/applications/:id/toggles")
		{
			toggles.POST("", handler.RequireAdmin(), handler.CreateToggle)
			toggles.GET("", handler.GetAllToggles) // Filtrado por permissão internamente
		}
		toggleById := protected.Group("/applications/:id/toggles/:toggleId")
		{
			toggleById.GET("", handler.GetToggleStatus)
			toggleById.PUT("", handler.RequireAdmin(), handler.UpdateToggle)
			toggleById.DELETE("", handler.RequireAdmin(), handler.DeleteToggle)
		}

		// Rota para atualizar enabled recursivamente (apenas admin/root)
		protected.PUT("/applications/:id/toggle/:toggleId", handler.RequireAdmin(), handler.UpdateEnabled)

		// Rotas de gerenciamento de secret keys (apenas admin/root)
		secretKeys := protected.Group("/secret-keys")
		{
			secretKeys.DELETE("/:id", handler.RequireAdmin(), handler.DeleteSecretKey)
		}

		// Rotas de gestão de usuários (apenas root pode acessar)
		userManagement := protected.Group("/users")
		userManagement.Use(handler.RequireRoot())
		{
			userManagement.POST("", handler.CreateUser)
			userManagement.GET("", handler.ListUsers)
			userManagement.GET("/:id", handler.GetUser)
			userManagement.PUT("/:id", handler.UpdateUser)
			userManagement.DELETE("/:id", handler.DeleteUser)
		}

		// Rotas de usuário logado (todos podem acessar)
		profile := protected.Group("/profile")
		{
			profile.GET("", handler.GetCurrentUser)
			profile.POST("/change-password", handler.ChangePassword)
			profile.GET("/teams", handler.GetUserTeams)
		}

		// Rotas de gestão de times (apenas root pode acessar)
		teamManagement := protected.Group("/teams")
		teamManagement.Use(handler.RequireRoot())
		{
			teamManagement.POST("", handler.CreateTeam)
			teamManagement.GET("", handler.GetAllTeams)
			teamManagement.GET("/:id", handler.GetTeam)
			teamManagement.PUT("/:id", handler.UpdateTeam)
			teamManagement.DELETE("/:id", handler.DeleteTeam)
			
			// Gestão de usuários nos times
			teamManagement.POST("/:id/users", handler.AddUserToTeam)
			teamManagement.DELETE("/:id/users/:user_id", handler.RemoveUserFromTeam)
			teamManagement.GET("/:id/users", handler.GetTeamUsers)
			
			// Gestão de aplicações nos times
			teamManagement.POST("/:id/applications", handler.AddApplicationToTeam)
			teamManagement.DELETE("/:id/applications/:app_id", handler.RemoveApplicationFromTeam)
			teamManagement.PUT("/:id/applications/:app_id", handler.UpdateApplicationPermission)
			teamManagement.GET("/:id/applications", handler.GetTeamApplications)
		}
	}

	// Rota para servir o arquivo LICENSE da raiz
	router.GET("/LICENSE", func(c *gin.Context) {
		c.File("LICENSE")
	})

	// Rota para página de login
	router.GET("/login", func(c *gin.Context) {
		c.File("static/login.html")
	})

	// Rota para página de troca de senha (com validação especial)
	router.GET("/change-password", handler.ValidatePasswordChangeAccess(), func(c *gin.Context) {
		c.File("static/change-password.html")
	})

	// Rota raiz serve o frontend (protegida)
	router.GET("/", handler.ValidateToken(), func(c *gin.Context) {
		c.File("static/index.html")
	})
}
