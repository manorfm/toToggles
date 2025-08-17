package entity

import (
	"time"
)

// UserApplication representa o relacionamento many-to-many entre User e Application
type UserApplication struct {
	UserID        string    `gorm:"primaryKey;type:varchar(26)"`
	ApplicationID string    `gorm:"primaryKey;type:varchar(26)"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`

	// Relacionamentos
	User        User        `gorm:"foreignKey:UserID"`
	Application Application `gorm:"foreignKey:ApplicationID"`
}