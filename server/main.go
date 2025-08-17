package main

import (
	"github.com/manorfm/totoogle/internal/app/config"
	"github.com/manorfm/totoogle/internal/app/router"
)

var (
	logger config.Logger
)

func main() {
	logger := config.GetLogger("main")

	err := config.Init()

	if err != nil {
		logger.Errorf("config initialization error: %v", err)
		return
	}

	router.Initialize()
}
