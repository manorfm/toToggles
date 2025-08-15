package entity

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

// Team representa um time/equipe no sistema
type Team struct {
	ID          string    `json:"id" gorm:"primaryKey;type:varchar(26)"`
	Name        string    `json:"name" gorm:"not null;type:varchar(100);uniqueIndex"`
	Description string    `json:"description" gorm:"type:varchar(500)"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`

	// Relacionamentos
	Users        []*User        `json:"users,omitempty" gorm:"many2many:team_users;"`
	Applications []*Application `json:"applications,omitempty" gorm:"many2many:team_applications;"`
}

// TeamPermissionLevel define os níveis de permissão que um time pode ter em uma aplicação
type TeamPermissionLevel string

const (
	PermissionRead   TeamPermissionLevel = "read"   // Apenas visualizar
	PermissionWrite  TeamPermissionLevel = "write"  // Visualizar e editar
	PermissionAdmin  TeamPermissionLevel = "admin"  // Controle total da aplicação
)

// TeamApplication representa a associação entre team e application com permissões específicas
type TeamApplication struct {
	TeamID        string                `gorm:"primaryKey;type:varchar(26)"`
	ApplicationID string                `gorm:"primaryKey;type:varchar(26)"`
	Permission    TeamPermissionLevel   `gorm:"not null;type:varchar(20);default:'read'"`
	CreatedAt     time.Time            `json:"created_at"`
	UpdatedAt     time.Time            `json:"updated_at"`

	// Relacionamentos
	Team        Team        `gorm:"foreignKey:TeamID"`
	Application Application `gorm:"foreignKey:ApplicationID"`
}

// TeamUser representa a associação entre team e user
type TeamUser struct {
	TeamID    string    `gorm:"primaryKey;type:varchar(26)"`
	UserID    string    `gorm:"primaryKey;type:varchar(26)"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	// Relacionamentos
	Team Team `gorm:"foreignKey:TeamID"`
	User User `gorm:"foreignKey:UserID"`
}

// BeforeCreate hook para gerar ID único
func (t *Team) BeforeCreate(tx *gorm.DB) error {
	if t.ID == "" {
		t.ID = generateULID()
	}
	return nil
}

// Validate valida os dados do time
func (t *Team) Validate() error {
	if t.Name == "" {
		return errors.New("team name is required")
	}

	if len(t.Name) < 2 {
		return errors.New("team name must be at least 2 characters long")
	}

	if len(t.Name) > 100 {
		return errors.New("team name must be at most 100 characters long")
	}

	if len(t.Description) > 500 {
		return errors.New("team description must be at most 500 characters long")
	}

	return nil
}

// HasUser verifica se um usuário pertence ao time
func (t *Team) HasUser(userID string) bool {
	for _, user := range t.Users {
		if user.ID == userID {
			return true
		}
	}
	return false
}

// HasApplication verifica se uma aplicação está associada ao time
func (t *Team) HasApplication(applicationID string) bool {
	for _, app := range t.Applications {
		if app.ID == applicationID {
			return true
		}
	}
	return false
}

// GetUserCount retorna o número de usuários no time
func (t *Team) GetUserCount() int {
	return len(t.Users)
}

// GetApplicationCount retorna o número de aplicações associadas ao time
func (t *Team) GetApplicationCount() int {
	return len(t.Applications)
}

// TeamWithCounts representa um time com informações de contagem
type TeamWithCounts struct {
	ID              string    `json:"id"`
	Name            string    `json:"name"`
	Description     string    `json:"description"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
	UserCount       int       `json:"user_count"`
	ApplicationCount int      `json:"application_count"`
}

// ValidatePermission valida se um nível de permissão é válido
func ValidatePermission(permission TeamPermissionLevel) error {
	switch permission {
	case PermissionRead, PermissionWrite, PermissionAdmin:
		return nil
	default:
		return errors.New("invalid permission level. Must be 'read', 'write', or 'admin'")
	}
}