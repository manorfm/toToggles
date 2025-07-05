package database

import (
	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/domain/repository"
	"gorm.io/gorm"
)

// ApplicationRepositoryImpl implementa ApplicationRepository
type ApplicationRepositoryImpl struct {
	db *gorm.DB
}

// NewApplicationRepository cria uma nova instância de ApplicationRepositoryImpl
func NewApplicationRepository(db *gorm.DB) repository.ApplicationRepository {
	return &ApplicationRepositoryImpl{
		db: db,
	}
}

// Create cria uma nova aplicação
func (r *ApplicationRepositoryImpl) Create(app *entity.Application) error {
	return r.db.Create(app).Error
}

// GetByID busca uma aplicação por ID
func (r *ApplicationRepositoryImpl) GetByID(id string) (*entity.Application, error) {
	var app entity.Application
	err := r.db.Where("id = ?", id).First(&app).Error
	if err != nil {
		return nil, err
	}
	return &app, nil
}

// GetAll busca todas as aplicações
func (r *ApplicationRepositoryImpl) GetAll() ([]*entity.Application, error) {
	var apps []*entity.Application
	err := r.db.Find(&apps).Error
	if err != nil {
		return nil, err
	}
	return apps, nil
}

// Update atualiza uma aplicação
func (r *ApplicationRepositoryImpl) Update(app *entity.Application) error {
	return r.db.Save(app).Error
}

// Delete remove uma aplicação e todas as suas toggles em cascata
func (r *ApplicationRepositoryImpl) Delete(id string) error {
	// Inicia uma transação
	tx := r.db.Begin()
	if tx.Error != nil {
		return tx.Error
	}

	// Deleta todas as toggles da aplicação primeiro
	err := tx.Where("app_id = ?", id).Delete(&entity.Toggle{}).Error
	if err != nil {
		tx.Rollback()
		return err
	}

	// Deleta a aplicação
	err = tx.Where("id = ?", id).Delete(&entity.Application{}).Error
	if err != nil {
		tx.Rollback()
		return err
	}

	// Commit da transação
	return tx.Commit().Error
}

// Exists verifica se uma aplicação existe
func (r *ApplicationRepositoryImpl) Exists(id string) (bool, error) {
	var count int64
	err := r.db.Model(&entity.Application{}).Where("id = ?", id).Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}
