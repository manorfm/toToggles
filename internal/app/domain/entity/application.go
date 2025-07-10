package entity

import (
	"math/rand"
	"time"

	"github.com/oklog/ulid/v2"
)

// Application representa uma aplicação no sistema
type Application struct {
	ID        string    `json:"id" gorm:"primaryKey;type:varchar(26)"`
	Name      string    `json:"name" gorm:"not null;type:varchar(255)"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
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

// generateULID gera um ID único baseado em timestamp
func generateULID() string {
	t := time.Now().UTC()
	e := ulid.Monotonic(rand.New(rand.NewSource(t.UnixNano())), 0)
	return ulid.MustNew(ulid.Timestamp(t), e).String()
}
