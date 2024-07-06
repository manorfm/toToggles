package router

import (
	"github.com/manorfm/totoogle/internal/app/handler"

	"github.com/gin-gonic/gin"
)

func initialize(router *gin.Engine) {
	v1 := router.Group("/api/v1")
	{
		v1.GET("/toggles", handler.ListToggles)
	}
}
