package repository

import "github.com/manorfm/totoogle/internal/app/domain/entity"

// ToggleRepository define os contratos para operações com toggles
type ToggleRepository interface {
	Create(toggle *entity.Toggle) error
	GetByID(id string) (*entity.Toggle, error)
	GetByPath(path string, appID string) (*entity.Toggle, error)
	GetByAppID(appID string) ([]*entity.Toggle, error)
	GetHierarchyByAppID(appID string) ([]*entity.Toggle, error)
	Update(toggle *entity.Toggle) error
	Delete(id string) error
	DeleteByPath(path string, appID string) error
	Exists(path string, appID string) (bool, error)
	GetChildren(parentID string) ([]*entity.Toggle, error)
}
