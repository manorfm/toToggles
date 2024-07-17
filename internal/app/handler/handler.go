package handler

import (
	"github.com/manorfm/totoogle/internal/app/config"
	"gorm.io/gorm"
)

var (
	logger *config.Logger
	db     DBInterface
)

type DBInterface interface {
	Create(value interface{}) *gorm.DB
}

func Init() {
	logger = config.GetLogger("handler")
	db = config.GetDatabase()
}
