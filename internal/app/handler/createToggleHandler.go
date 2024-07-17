package handler

import (
	"github.com/gin-gonic/gin"
)

func CreateToggles(ctx *gin.Context) {
	request := CreateToggleRequest{}

	logger.Infof("creating toggle %+v", request)
	ctx.BindJSON(&request)

	err := request.Validate()
	if err != nil {
		logger.Errorf("error validating toggle %v", err.Error())
		return
	}

	toggle, err := request.toToggle()
	if err != nil {
		logger.Errorf("error creating toggle %v", err.Error())
	}

	if err := db.Create(toggle).Error; err != nil {
		logger.Errorf("error persisting toggle %v", err.Error())
	}
}
