package repository

import "github.com/manorfm/totoogle/internal/app/domain/entity"

// ApplicationRepository define os contratos para operações com aplicações
type ApplicationRepository interface {
	Create(app *entity.Application) error
	GetByID(id string) (*entity.Application, error)
	GetAll() ([]*entity.Application, error)
	GetAllWithToggleCounts() ([]*entity.ApplicationWithCounts, error)
	Update(app *entity.Application) error
	Delete(id string) error
	Exists(id string) (bool, error)
}
