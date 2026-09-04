package router

import (
	"github.com/gin-gonic/gin"
	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/handler"
	"github.com/manorfm/totoogle/internal/app/middleware"
)

func Init(router *gin.Engine) {
	// Middlewares de segurança globais. Sem CORS: este serviço não é acessado por navegadores
	// de origem diferente (frontend servido same-origin por este mesmo binário; nenhum acesso
	// à internet) — nem o cookie de sessão (SameSite=Strict) nem a API pública de secret key
	// (server-to-server, nunca sujeita a CORS) dependiam dele. Removido junto com o fallback
	// de Authorization header em ValidateToken(), a única coisa que CORS ainda protegia de
	// verdade.
	router.Use(middleware.SecurityHeaders())
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

		// Kill switch — mesma secret key acima, só desliga um toggle por path, nunca liga.
		// Deliberadamente fora de `protected`/approval: ver docs/rest-flow.md.
		api.POST("/toggles/disable", handler.DisableToggleBySecret)

		// Rotas públicas de autenticação
		auth := api.Group("/auth")
		{
			auth.POST("/login", middleware.LoginRateLimit(), handler.Login)
			// Rate-limitado à parte do login (por IP) — sem sessão, sem CSRF, um endpoint que
			// sempre responde 200 seria um alvo fácil de flood de eventos de auditoria sem isso.
			auth.POST("/forgot-password", middleware.ForgotPasswordRateLimit(), handler.ForgotPassword)
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
				applications.POST("/:id/generate-secret", handler.RequireApprovalAware(entity.UserRoleAdmin), handler.GenerateSecretKey)
				applications.GET("/:id/secret-keys", handler.RequireAdmin(), handler.GetSecretKeys)
			}

			// Rotas de toggles
			toggles := protected.Group("/applications/:id/toggles")
			{
				toggles.POST("", handler.RequireApprovalAware(entity.UserRoleAdmin), handler.CreateToggle)
				toggles.GET("", handler.GetAllToggles) // Filtrado por permissão internamente
				// Lista as raízes de arquivamento (toggles apagados) — v2.6 §4.1. Registrada antes
				// de :toggleId por clareza, mas Gin (radix tree desde v1.7) já prioriza segmentos
				// estáticos sobre parâmetros no mesmo nível, então não colide com GET .../toggles/:toggleId.
				toggles.GET("/archived", handler.RequireAdmin(), handler.GetArchivedToggles)
			}
			toggleById := protected.Group("/applications/:id/toggles/:toggleId")
			{
				toggleById.GET("", handler.GetToggleStatus)
				toggleById.PUT("", handler.RequireApprovalAware(entity.UserRoleAdmin), handler.UpdateToggle)
				toggleById.DELETE("", handler.RequireApprovalAware(entity.UserRoleAdmin), handler.DeleteToggle)
				// Restaurar não passa pelo workflow de aprovação — é uma correção/desfazer de uma
				// ação já decidida (e já auditada), não uma mutação de negócio nova a revisar.
				toggleById.POST("/restore", handler.RequireAdmin(), handler.RestoreToggle)
			}

			// Rota para atualizar enabled recursivamente (apenas admin/root)
			protected.PUT("/applications/:id/toggle/:toggleId", handler.RequireApprovalAware(entity.UserRoleAdmin), handler.UpdateEnabled)

			// Rotas de gerenciamento de secret keys (apenas admin/root)
			secretKeys := protected.Group("/secret-keys")
			{
				secretKeys.DELETE("/:id", handler.RequireApprovalAware(entity.UserRoleAdmin), handler.DeleteSecretKey)
			}

			// Rotas de gestão de usuários — criar/listar: root ou admin (admin escopado aos
			// próprios times, checado no handler); as demais mutações continuam root only.
			userManagement := protected.Group("/users")
			{
				userManagement.POST("", handler.RequireAdmin(), handler.CreateUser)
				userManagement.GET("", handler.RequireAdmin(), handler.ListUsers)
				userManagement.GET("/:id", handler.RequireRoot(), handler.GetUser)
				userManagement.PUT("/:id", handler.RequireRoot(), handler.UpdateUser)
				userManagement.DELETE("/:id", handler.RequireRoot(), handler.DeleteUser)
				userManagement.POST("/:id/reset-password", handler.RequireAdmin(), handler.ResetUserPassword)
				userManagement.PUT("/:id/status", handler.RequireAdmin(), handler.SetUserStatus)
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
				approval.GET("/requests/pending", handler.RequireRoot(), handler.GetPendingApprovalRequests)
				approval.GET("/requests/my", handler.GetMyApprovalRequests)
				approval.GET("/requests/approvable", handler.GetApprovableRequests)
				approval.GET("/requests/:id", handler.GetApprovalRequest)

				// Ações de aprovação/rejeição
				approval.POST("/requests/:id/approve", handler.ApproveRequest)
				approval.POST("/requests/:id/reject", handler.RejectRequest)
				approval.POST("/requests/:id/execute", handler.ExecuteApprovedAction)
				approval.POST("/requests/:id/withdraw", handler.WithdrawRequest)

				// Solicitações por team
				approval.GET("/teams/:id/requests", handler.GetApprovalRequestsByTeam)

				// Estatísticas
				approval.GET("/stats", handler.GetApprovalStats)
				approval.GET("/teams/:id/stats", handler.GetApprovalStatsByTeam)

				// Manutenção
				approval.POST("/mark-expired", handler.RequireRoot(), handler.MarkExpiredRequests)

				// Aprovadores
				approval.GET("/my-approver-teams", handler.GetMyApproverTeams)
				approval.GET("/teams-without-approver", handler.GetTeamsWithoutApprover)
			}

			// Audit trail — qualquer usuário autenticado, sem RequireRoot/RequireAdmin: a
			// visibilidade é escopada por time dentro do usecase (domain/policy.AuditAccess),
			// mesmo padrão de GET /approval/requests.
			protected.GET("/audit", handler.GetAuditLog)
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
