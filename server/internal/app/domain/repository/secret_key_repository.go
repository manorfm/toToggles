package repository

import "github.com/manorfm/totoogle/internal/app/domain/entity"

type SecretKeyRepository interface {
	Create(secretKey *entity.SecretKey) error
	GetByID(id string) (*entity.SecretKey, error)
	GetByHash(hash string) (*entity.SecretKey, error)
	GetByApplicationID(applicationID string) ([]*entity.SecretKey, error)
	GetAll() ([]*entity.SecretKey, error)
	Update(secretKey *entity.SecretKey) error
	Delete(id string) error
}