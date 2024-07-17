package router

import (
	"github.com/manorfm/totoogle/internal/app/handler"

	"github.com/gin-gonic/gin"
)

func Init(router *gin.Engine) {
	handler.Init()

	v1 := router.Group("/api/v1")
	{
		v1.GET("/toggles", handler.ListToggles)
		v1.POST("/toggles", handler.CreateToggles)
	}
}
