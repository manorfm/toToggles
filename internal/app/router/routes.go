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
	}

	// Rotas protegidas que requerem autenticação
	protected := router.Group("")
	protected.Use(handler.ValidateToken())
	{
		// Rotas de aplicações
		applications := protected.Group("/applications")
		{
			applications.POST("", handler.CreateApplication)
			applications.GET("", handler.GetAllApplications)
			applications.GET("/:id", handler.GetApplication)
			applications.PUT("/:id", handler.UpdateApplication)
			applications.DELETE("/:id", handler.DeleteApplication)
		}

		// Rotas de toggles
		toggles := protected.Group("/applications/:id/toggles")
		{
			toggles.POST("", handler.CreateToggle)
			toggles.GET("", handler.GetAllToggles)
		}
		toggleById := protected.Group("/applications/:id/toggles/:toggleId")
		{
			toggleById.GET("", handler.GetToggleStatus)
			toggleById.PUT("", handler.UpdateToggle)
			toggleById.DELETE("", handler.DeleteToggle)
		}

		// Rota para atualizar enabled recursivamente
		protected.PUT("/applications/:id/toggle/:toggleId", handler.UpdateEnabled)
	}

	// Rota para servir o arquivo LICENSE da raiz
	router.GET("/LICENSE", func(c *gin.Context) {
		c.File("LICENSE")
	})

	// Rota para página de login
	router.GET("/login", func(c *gin.Context) {
		c.File("static/login.html")
	})

	// Rota raiz serve o frontend (protegida)
	router.GET("/", handler.ValidateToken(), func(c *gin.Context) {
		c.File("static/index.html")
	})
}
