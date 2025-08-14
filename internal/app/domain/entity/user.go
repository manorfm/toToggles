package entity

import (
	"errors"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type UserRole string

const (
	UserRoleAdmin UserRole = "admin"
	UserRoleUser  UserRole = "user"
)

type User struct {
	ID        string    `json:"id" gorm:"primaryKey;type:varchar(26)"`
	Username  string    `json:"username" gorm:"uniqueIndex;not null;type:varchar(100)"`
	Password  string    `json:"-" gorm:"not null;type:varchar(255)"` // Hash da senha
	Role      UserRole  `json:"role" gorm:"not null;type:varchar(20);default:'user'"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	// Relacionamentos
	Applications []Application `json:"applications,omitempty" gorm:"many2many:user_applications;"`
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

// IsAdmin verifica se o usuário é admin
func (u *User) IsAdmin() bool {
	return u.Role == UserRoleAdmin
}

// Validate valida os dados do usuário
func (u *User) Validate() error {
	if u.Username == "" {
		return errors.New("username is required")
	}

	if len(u.Username) < 3 {
		return errors.New("username must be at least 3 characters long")
	}

	if u.Role != UserRoleAdmin && u.Role != UserRoleUser {
		return errors.New("invalid user role")
	}

	return nil
}