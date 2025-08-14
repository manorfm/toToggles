package database

import (
	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/domain/repository"
	"gorm.io/gorm"
)

type secretKeyRepository struct {
	db *gorm.DB
}

func NewSecretKeyRepository(db *gorm.DB) repository.SecretKeyRepository {
	return &secretKeyRepository{db: db}
}

func (r *secretKeyRepository) Create(secretKey *entity.SecretKey) error {
	return r.db.Create(secretKey).Error
}

func (r *secretKeyRepository) GetByID(id string) (*entity.SecretKey, error) {
	var secretKey entity.SecretKey
	err := r.db.Preload("Application").Preload("Creator").First(&secretKey, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &secretKey, nil
}

func (r *secretKeyRepository) GetByHash(hash string) (*entity.SecretKey, error) {
	var secretKey entity.SecretKey
	err := r.db.Preload("Application").Preload("Creator").First(&secretKey, "key_hash = ?", hash).Error
	if err != nil {
		return nil, err
	}
	return &secretKey, nil
}

func (r *secretKeyRepository) GetByApplicationID(applicationID string) ([]*entity.SecretKey, error) {
	var secretKeys []*entity.SecretKey
	err := r.db.Preload("Application").Preload("Creator").
		Where("application_id = ?", applicationID).
		Find(&secretKeys).Error
	return secretKeys, err
}

func (r *secretKeyRepository) GetAll() ([]*entity.SecretKey, error) {
	var secretKeys []*entity.SecretKey
	err := r.db.Preload("Application").Preload("Creator").Find(&secretKeys).Error
	return secretKeys, err
}

func (r *secretKeyRepository) Update(secretKey *entity.SecretKey) error {
	return r.db.Save(secretKey).Error
}

func (r *secretKeyRepository) Delete(id string) error {
	return r.db.Delete(&entity.SecretKey{}, "id = ?", id).Error
}