package router

import (
	"github.com/gin-gonic/gin"
	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/handler"
	"github.com/manorfm/totoogle/internal/app/middleware"
)

func Init(router *gin.Engine) {
	// Middlewares de segurança globais
	router.Use(middleware.SecurityHeaders())
	router.Use(middleware.CORSHeaders())
	router.Use(middleware.RequestID())

	// Health check endpoints (no authentication required for k8s probes)
	router.GET("/health", handler.HealthCheck)
	router.GET("/ready", handler.ReadinessCheck)

	// Middleware para servir arquivos estáticos
	router.Use(handler.ServeStatic)

	// Rotas de arquivos estáticos
	router.Static("/static", "./static")

	// Toda a API (sessão ou secret key) vive sob /api — separado de propósito das rotas
	// SPA, que nunca usam esse prefixo. isAPIRoute() em static_handler.go decide API-vs-SPA
	// só por esse prefixo agora; antes usava uma lista de heurísticas por path que colidia
	// com rotas SPA de mesmo nome (ex.: GET /teams sendo tanto a tela quanto a API — um hard
	// refresh em /teams devolvia o JSON da API em vez da casca do SPA).
	api := router.Group("/api")
	{
		// Rota pública da API (acesso por secret key via header X-API-Key)
		api.GET("/toggles", handler.GetTogglesBySecret)

		// Rotas públicas de autenticação
		auth := api.Group("/auth")
		{
			auth.POST("/login", handler.Login)
			auth.POST("/logout", handler.Logout)
			auth.GET("/check-first-access", handler.CheckFirstAccess)
			auth.POST("/change-password", handler.ValidateToken(), handler.ChangePassword)
			auth.POST("/change-password-first-time", handler.ChangePasswordFirstTime)
		}

		// Rotas protegidas que requerem autenticação
		protected := api.Group("")
		protected.Use(handler.ValidateToken())
		{
			// Rotas de aplicações
			applications := protected.Group("/applications")
			{
				applications.POST("", handler.RequireApprovalAware(entity.UserRoleAdmin), handler.CreateApplication)
				applications.GET("", handler.GetAllApplications) // Filtrado por permissão internamente
				applications.GET("/:id", handler.GetApplication)
				applications.PUT("/:id", handler.RequireApprovalAware(entity.UserRoleAdmin), handler.UpdateApplication)
				applications.DELETE("/:id", handler.RequireApprovalAware(entity.UserRoleRoot), handler.DeleteApplication)

				// Rotas de secret keys para aplicações (apenas admin/root)
				applications.POST("/:id/generate-secret", handler.RequireAdmin(), handler.GenerateSecretKey)
				applications.GET("/:id/secret-keys", handler.RequireAdmin(), handler.GetSecretKeys)
			}

			// Rotas de toggles
			toggles := protected.Group("/applications/:id/toggles")
			{
				toggles.POST("", handler.RequireApprovalAware(entity.UserRoleAdmin), handler.CreateToggle)
				toggles.GET("", handler.GetAllToggles) // Filtrado por permissão internamente
			}
			toggleById := protected.Group("/applications/:id/toggles/:toggleId")
			{
				toggleById.GET("", handler.GetToggleStatus)
				toggleById.PUT("", handler.RequireApprovalAware(entity.UserRoleAdmin), handler.UpdateToggle)
				toggleById.DELETE("", handler.RequireApprovalAware(entity.UserRoleAdmin), handler.DeleteToggle)
			}

			// Rota para atualizar enabled recursivamente (apenas admin/root)
			protected.PUT("/applications/:id/toggle/:toggleId", handler.RequireApprovalAware(entity.UserRoleAdmin), handler.UpdateEnabled)

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

				// Gestão de aprovadores nos times
				teamManagement.POST("/:id/approvers/:user_id", handler.SetTeamApprover)
				teamManagement.GET("/:id/approvers", handler.GetTeamApprovers)
			}

			// Rotas do sistema de aprovação (protegidas)
			approval := protected.Group("/approval")
			{
				// Configurações de aprovação (apenas root)
				approval.GET("/settings", handler.RequireRoot(), handler.GetApprovalSettings)
				approval.PUT("/settings", handler.RequireRoot(), handler.UpdateApprovalSettings)

				// Verificações de status
				approval.GET("/enabled", handler.IsApprovalEnabled)
				approval.GET("/required", handler.CheckApprovalRequired)

				// Solicitações de aprovação
				approval.POST("/requests", handler.CreateApprovalRequest)
				approval.GET("/requests", handler.GetAllApprovalRequests)
				approval.GET("/requests/pending", handler.GetPendingApprovalRequests)
				approval.GET("/requests/my", handler.GetMyApprovalRequests)
				approval.GET("/requests/approvable", handler.GetApprovableRequests)
				approval.GET("/requests/:id", handler.GetApprovalRequest)

				// Ações de aprovação/rejeição
				approval.POST("/requests/:id/approve", handler.ApproveRequest)
				approval.POST("/requests/:id/reject", handler.RejectRequest)
				approval.POST("/requests/:id/execute", handler.ExecuteApprovedAction)

				// Solicitações por team
				approval.GET("/teams/:id/requests", handler.GetApprovalRequestsByTeam)

				// Estatísticas
				approval.GET("/stats", handler.GetApprovalStats)
				approval.GET("/teams/:id/stats", handler.GetApprovalStatsByTeam)

				// Manutenção
				approval.POST("/mark-expired", handler.RequireRoot(), handler.MarkExpiredRequests)

				// Aprovadores
				approval.GET("/my-approver-teams", handler.GetMyApproverTeams)
			}
		}
	}

	// Rota para servir o arquivo LICENSE da raiz
	router.GET("/LICENSE", func(c *gin.Context) {
		c.File("LICENSE")
	})

	// Rota para página de login (novo frontend React, em server/web — build em static/app)
	router.GET("/login", func(c *gin.Context) {
		c.File("static/app/index.html")
	})

	// Rota para página de troca de senha (com validação especial)
	// TODO(frontend): ainda serve a casca do app novo (server/web) sem tela própria —
	// falta migrar do protótipo. Ver server/web/src/screens.
	router.GET("/change-password", handler.ValidatePasswordChangeAccess(), func(c *gin.Context) {
		c.File("static/app/index.html")
	})

	// Rota raiz serve o frontend (protegida)
	// TODO(frontend): idem — dashboard ainda não foi migrado do protótipo.
	router.GET("/", handler.ValidateToken(), func(c *gin.Context) {
		c.File("static/app/index.html")
	})
}
