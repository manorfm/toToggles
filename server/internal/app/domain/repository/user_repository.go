package repository

import "github.com/manorfm/totoogle/internal/app/domain/entity"

type UserRepository interface {
	Create(user *entity.User) error
	GetByID(id string) (*entity.User, error)
	GetByUsername(username string) (*entity.User, error)
	GetAll() ([]*entity.User, error)
	Update(user *entity.User) error
	Delete(id string) error
	GetApplicationsByUserID(userID string) ([]*entity.Application, error)
	AddUserToApplication(userID, applicationID string) error
	RemoveUserFromApplication(userID, applicationID string) error
	GetUsersByApplicationID(applicationID string) ([]*entity.User, error)
}