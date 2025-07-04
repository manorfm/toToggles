package router

import (
	"github.com/gin-gonic/gin"
	"github.com/manorfm/totoogle/internal/app/handler"
)

func Init(router *gin.Engine) {
	// Middleware para servir arquivos estáticos
	router.Use(handler.ServeStatic)

	// Rotas de arquivos estáticos
	router.Static("/static", "./static")

	// Rotas de aplicações
	applications := router.Group("/applications")
	{
		applications.POST("", handler.CreateApplication)
		applications.GET("", handler.GetAllApplications)
		applications.GET("/:id", handler.GetApplication)
		applications.PUT("/:id", handler.UpdateApplication)
		applications.DELETE("/:id", handler.DeleteApplication)
	}

	// Rotas de toggles
	toggles := router.Group("/applications/:id/toggles")
	{
		toggles.POST("", handler.CreateToggle)
		toggles.GET("", handler.GetAllToggles)
		toggles.GET("/status", handler.GetToggleStatus)
		toggles.PUT("", handler.UpdateToggle)
		toggles.DELETE("", handler.DeleteToggle)
	}

	// Rota para atualizar enabled recursivamente
	router.PUT("/applications/:id/toggle/:toggleId", handler.UpdateEnabled)

	// Rota raiz serve o frontend
	router.GET("/", func(c *gin.Context) {
		c.File("static/index.html")
	})
}
