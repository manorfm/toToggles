package router

import (
	"github.com/gin-gonic/gin"
	"github.com/manorfm/totoogle/internal/app/config"
	"github.com/manorfm/totoogle/internal/app/handler"
)

func Initialize() {
	router := gin.Default()

	// Inicializa os handlers
	handler.InitHandlers(config.GetDatabase())

	Init(router)

	router.Run(":3056")
}
