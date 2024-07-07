package schemas

import (
	"time"

	"gorm.io/gorm"
)

type Toggle struct {
	gorm.Model
	On          bool
	Name        string
	ToggleChild uint
	Toggle      *Toggle `gorm:"foreignKey:ToggleChild"`
}

type ToggleAudit struct {
	gorm.Model
	Name      string
	UpdatedAt time.Time
	FieldName string
	OldValue  string
	NewValue  string
}
