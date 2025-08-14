package database

import (
	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/domain/repository"
	"gorm.io/gorm"
)

type userRepository struct {
	db *gorm.DB
}

func NewUserRepository(db *gorm.DB) repository.UserRepository {
	return &userRepository{db: db}
}

func (r *userRepository) Create(user *entity.User) error {
	return r.db.Create(user).Error
}

func (r *userRepository) GetByID(id string) (*entity.User, error) {
	var user entity.User
	err := r.db.Preload("Applications").First(&user, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *userRepository) GetByUsername(username string) (*entity.User, error) {
	var user entity.User
	err := r.db.Preload("Applications").First(&user, "username = ?", username).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *userRepository) GetAll() ([]*entity.User, error) {
	var users []*entity.User
	err := r.db.Preload("Applications").Find(&users).Error
	return users, err
}

func (r *userRepository) Update(user *entity.User) error {
	return r.db.Save(user).Error
}

func (r *userRepository) Delete(id string) error {
	// Primeiro, remover todas as associações com applications
	err := r.db.Exec("DELETE FROM user_applications WHERE user_id = ?", id).Error
	if err != nil {
		return err
	}
	
	// Depois, remover o usuário
	return r.db.Delete(&entity.User{}, "id = ?", id).Error
}

func (r *userRepository) GetApplicationsByUserID(userID string) ([]*entity.Application, error) {
	var applications []*entity.Application
	err := r.db.Table("applications").
		Joins("JOIN user_applications ON applications.id = user_applications.application_id").
		Where("user_applications.user_id = ?", userID).
		Find(&applications).Error
	return applications, err
}

func (r *userRepository) AddUserToApplication(userID, applicationID string) error {
	userApp := entity.UserApplication{
		UserID:        userID,
		ApplicationID: applicationID,
	}
	return r.db.Create(&userApp).Error
}

func (r *userRepository) RemoveUserFromApplication(userID, applicationID string) error {
	return r.db.Delete(&entity.UserApplication{}, "user_id = ? AND application_id = ?", userID, applicationID).Error
}

func (r *userRepository) GetUsersByApplicationID(applicationID string) ([]*entity.User, error) {
	var users []*entity.User
	err := r.db.Table("users").
		Joins("JOIN user_applications ON users.id = user_applications.user_id").
		Where("user_applications.application_id = ?", applicationID).
		Find(&users).Error
	return users, err
}