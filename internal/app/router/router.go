package router

import "github.com/gin-gonic/gin"

func Initialize() {
	router := gin.Default()

	Init(router)

	router.Run(":8080")
}
