package database

import (
	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/domain/repository"
	"gorm.io/gorm"
)

// ToggleRepositoryImpl implementa ToggleRepository
type ToggleRepositoryImpl struct {
	db *gorm.DB
}

// NewToggleRepository cria uma nova instância de ToggleRepositoryImpl
func NewToggleRepository(db *gorm.DB) repository.ToggleRepository {
	return &ToggleRepositoryImpl{
		db: db,
	}
}

// Create cria um novo toggle
func (r *ToggleRepositoryImpl) Create(toggle *entity.Toggle) error {
	return r.db.Create(toggle).Error
}

// GetByID busca um toggle por ID
func (r *ToggleRepositoryImpl) GetByID(id string) (*entity.Toggle, error) {
	var toggle entity.Toggle
	err := r.db.Preload("Parent").Preload("Children").Where("id = ?", id).First(&toggle).Error
	if err != nil {
		return nil, err
	}
	return &toggle, nil
}

// GetByPath busca um toggle por caminho e appID
func (r *ToggleRepositoryImpl) GetByPath(path string, appID string) (*entity.Toggle, error) {
	var toggle entity.Toggle
	err := r.db.Preload("Parent").Preload("Children").Where("path = ? AND app_id = ?", path, appID).First(&toggle).Error
	if err != nil {
		return nil, err
	}
	return &toggle, nil
}

// GetByAppID busca todos os toggles de uma aplicação
func (r *ToggleRepositoryImpl) GetByAppID(appID string) ([]*entity.Toggle, error) {
	var toggles []*entity.Toggle
	err := r.db.Where("app_id = ?", appID).Find(&toggles).Error
	if err != nil {
		return nil, err
	}
	return toggles, nil
}

// GetHierarchyByAppID busca todos os toggles de uma aplicação com hierarquia
func (r *ToggleRepositoryImpl) GetHierarchyByAppID(appID string) ([]*entity.Toggle, error) {
	var toggles []*entity.Toggle
	err := r.db.Preload("Parent").Preload("Children").Where("app_id = ?", appID).Order("level, value").Find(&toggles).Error
	if err != nil {
		return nil, err
	}
	return toggles, nil
}

// Update atualiza um toggle
func (r *ToggleRepositoryImpl) Update(toggle *entity.Toggle) error {
	return r.db.Save(toggle).Error
}

// Delete remove um toggle por ID e seus filhos em cascata
func (r *ToggleRepositoryImpl) Delete(id string) error {
	// Primeiro, deleta todos os filhos recursivamente
	children, err := r.GetChildren(id)
	if err != nil {
		return err
	}

	for _, child := range children {
		err = r.Delete(child.ID)
		if err != nil {
			return err
		}
	}

	// Depois deleta o toggle pai
	return r.db.Where("id = ?", id).Delete(&entity.Toggle{}).Error
}

// DeleteByPath remove um toggle e seus filhos por caminho
func (r *ToggleRepositoryImpl) DeleteByPath(path string, appID string) error {
	// Busca o toggle
	toggle, err := r.GetByPath(path, appID)
	if err != nil {
		return err
	}

	// Remove o toggle e seus filhos
	return r.Delete(toggle.ID)
}

// Exists verifica se um toggle existe
func (r *ToggleRepositoryImpl) Exists(path string, appID string) (bool, error) {
	var count int64
	err := r.db.Model(&entity.Toggle{}).Where("path = ? AND app_id = ?", path, appID).Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// GetChildren busca os filhos de um toggle
func (r *ToggleRepositoryImpl) GetChildren(parentID string) ([]*entity.Toggle, error) {
	var children []*entity.Toggle
	err := r.db.Where("parent_id = ?", parentID).Find(&children).Error
	if err != nil {
		return nil, err
	}
	return children, nil
}
