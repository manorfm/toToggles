package entity

import (
	"crypto/rand"
	"errors"
	"math/big"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type UserRole string

const (
	UserRoleRoot  UserRole = "root"  // Super usuário que gerencia outros usuários
	UserRoleAdmin UserRole = "admin" // Pode visualizar, criar e alterar dados
	UserRoleUser  UserRole = "user"  // Pode apenas visualizar dados
)

type User struct {
	ID                 string    `json:"id" gorm:"primaryKey;type:varchar(26)"`
	Username           string    `json:"username" gorm:"uniqueIndex;not null;type:varchar(100)"`
	Password           string    `json:"-" gorm:"not null;type:varchar(255)"` // Hash da senha
	Role               UserRole  `json:"role" gorm:"not null;type:varchar(20);default:'user'"`
	MustChangePassword bool      `json:"must_change_password" gorm:"default:false"` // Obriga troca de senha no próximo login
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`

	// Relacionamentos
	Applications []Application `json:"applications,omitempty" gorm:"many2many:user_applications;"`
	Teams        []*Team       `json:"teams,omitempty" gorm:"many2many:team_users;"`
}

// BeforeCreate hook para gerar ID único
func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.ID == "" {
		u.ID = generateULID()
	}
	return nil
}


// SetPassword cria o hash da senha
func (u *User) SetPassword(password string) error {
	if len(password) < 4 {
		return errors.New("password must be at least 4 characters long")
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	u.Password = string(hashedPassword)
	return nil
}

// CheckPassword verifica se a senha está correta
func (u *User) CheckPassword(password string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(u.Password), []byte(password))
	return err == nil
}

// IsRoot verifica se o usuário é root
func (u *User) IsRoot() bool {
	return u.Role == UserRoleRoot
}

// IsAdmin verifica se o usuário é admin
func (u *User) IsAdmin() bool {
	return u.Role == UserRoleAdmin
}

// IsUser verifica se o usuário é user
func (u *User) IsUser() bool {
	return u.Role == UserRoleUser
}

// CanManageUsers verifica se o usuário pode gerenciar outros usuários (só root pode)
func (u *User) CanManageUsers() bool {
	return u.IsRoot()
}

// CanModifyData verifica se o usuário pode modificar dados (admin e root)
func (u *User) CanModifyData() bool {
	return u.Role == UserRoleAdmin || u.Role == UserRoleRoot
}

// CanViewData verifica se o usuário pode visualizar dados (todos podem)
func (u *User) CanViewData() bool {
	return true // Todos os usuários podem visualizar dados
}

// IsMemberOfTeam verifica se o usuário é membro de um time específico
func (u *User) IsMemberOfTeam(teamID string) bool {
	for _, team := range u.Teams {
		if team.ID == teamID {
			return true
		}
	}
	return false
}

// GetTeamIDs retorna uma lista com os IDs dos times do usuário
func (u *User) GetTeamIDs() []string {
	teamIDs := make([]string, len(u.Teams))
	for i, team := range u.Teams {
		teamIDs[i] = team.ID
	}
	return teamIDs
}

// GetTeamCount retorna o número de times dos quais o usuário faz parte
func (u *User) GetTeamCount() int {
	return len(u.Teams)
}

// Validate valida os dados do usuário
func (u *User) Validate() error {
	if u.Username == "" {
		return errors.New("username is required")
	}

	if len(u.Username) < 3 {
		return errors.New("username must be at least 3 characters long")
	}

	if u.Role != UserRoleAdmin && u.Role != UserRoleUser && u.Role != UserRoleRoot {
		return errors.New("invalid user role")
	}

	return nil
}

// GenerateRandomPassword gera uma senha aleatória segura
func GenerateRandomPassword() (string, error) {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
	const length = 12

	password := make([]byte, length)
	for i := range password {
		num, err := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		if err != nil {
			return "", err
		}
		password[i] = charset[num.Int64()]
	}

	return string(password), nil
}