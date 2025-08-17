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

// GetAllWithToggleCounts busca todas as aplicações com contagem de toggles
func (r *ApplicationRepositoryImpl) GetAllWithToggleCounts() ([]*entity.ApplicationWithCounts, error) {
	var results []*entity.ApplicationWithCounts

	err := r.db.Table("applications").
		Select(`
			applications.id,
			applications.name,
			applications.created_at,
			applications.updated_at,
			COUNT(toggles.id) as total_toggles,
			SUM(CASE WHEN toggles.enabled = 1 THEN 1 ELSE 0 END) as enabled_toggles,
			SUM(CASE WHEN toggles.enabled = 0 THEN 1 ELSE 0 END) as disabled_toggles
		`).
		Joins("LEFT JOIN toggles ON applications.id = toggles.app_id").
		Group("applications.id, applications.name, applications.created_at, applications.updated_at").
		Order("applications.created_at DESC").
		Find(&results).Error

	return results, err
}
