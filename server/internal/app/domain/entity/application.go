package entity

import (
	"time"
)

// Application representa uma aplicação no sistema
type Application struct {
	ID        string    `json:"id" gorm:"primaryKey;type:varchar(26)"`
	Name      string    `json:"name" gorm:"not null;type:varchar(255)"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	// Relacionamentos - usar ponteiro para evitar importação circular
	Teams []*Team `json:"teams,omitempty" gorm:"many2many:team_applications;"`
}

// ApplicationWithCounts representa uma aplicação com contagem de toggles
type ApplicationWithCounts struct {
	ID              string    `json:"id"`
	Name            string    `json:"name"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
	TotalToggles    int       `json:"toggles_total"`
	EnabledToggles  int       `json:"toggles_enabled"`
	DisabledToggles int       `json:"toggles_disabled"`
}

// NewApplication cria uma nova instância de Application
func NewApplication(name string) *Application {
	return &Application{
		ID:   generateULID(),
		Name: name,
	}
}

