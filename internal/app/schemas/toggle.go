package schemas

import (
	"time"

	"gorm.io/gorm"
)

type Toggle struct {
	gorm.Model
	//Id      uint   `json:"id" gorm:"unique;primaryKey;autoIncrement"`
	On       bool   `json:"on"`
	Name     string `json:"name"`
	ParentID uint
	Parent   *Toggle `json:"parent"`
}

type ToggleAudit struct {
	gorm.Model
	Name      string
	UpdatedAt time.Time
	FieldName string
	OldValue  string
	NewValue  string
}

type ToggleResponse struct {
	ID   uint   `json:"id"`
	On   bool   `json:"on"`
	Name string `json:"name"`
	Path string `json:"path"`
}
