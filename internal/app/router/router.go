package router

import "github.com/gin-gonic/gin"

func Initialize() {
	router := gin.Default()

	initialize(router)

	router.Run(":8080")
}
