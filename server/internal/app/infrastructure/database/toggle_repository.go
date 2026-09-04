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

// MarkDeletionMeta grava quem apagou e marca este nó como raiz do arquivamento — chamado ANTES
// de Delete, sobre a mesma linha que Delete vai soft-apagar em seguida. Usa Model+Updates (não
// Save) pra não disparar o hook de soft-delete nem sobrescrever campos não carregados.
func (r *ToggleRepositoryImpl) MarkDeletionMeta(id string, deletedBy string) error {
	return r.db.Model(&entity.Toggle{}).Where("id = ?", id).
		Updates(map[string]interface{}{"deleted_by": deletedBy, "archived_root": true}).Error
}

// GetByIDUnscoped busca um toggle mesmo que esteja soft-apagado.
func (r *ToggleRepositoryImpl) GetByIDUnscoped(id string) (*entity.Toggle, error) {
	var toggle entity.Toggle
	err := r.db.Unscoped().Where("id = ?", id).First(&toggle).Error
	if err != nil {
		return nil, err
	}
	return &toggle, nil
}

// GetChildrenUnscoped inclui filhos soft-apagados — usado pra caminhar a subárvore arquivada
// inteira ao restaurar ou checar colisão de path antes de restaurar.
func (r *ToggleRepositoryImpl) GetChildrenUnscoped(parentID string) ([]*entity.Toggle, error) {
	var children []*entity.Toggle
	err := r.db.Unscoped().Where("parent_id = ?", parentID).Find(&children).Error
	if err != nil {
		return nil, err
	}
	return children, nil
}

// GetArchivedRootsByAppID lista as raízes de arquivamento (um item por operação de exclusão, não
// um item por nó da subárvore apagada) de uma aplicação, mais recentes primeiro, com o nome de
// quem apagou já resolvido (mesmo padrão de join usado em approval_request_repository.go pra
// requester_name/team_name).
func (r *ToggleRepositoryImpl) GetArchivedRootsByAppID(appID string) ([]*entity.ArchivedToggle, error) {
	var results []*entity.ArchivedToggle
	err := r.db.Unscoped().
		Table("toggles").
		Select("toggles.id, toggles.path, toggles.deleted_at, COALESCE(users.username, '') as deleted_by_name").
		Joins("LEFT JOIN users ON users.id = toggles.deleted_by").
		Where("toggles.app_id = ? AND toggles.archived_root = ? AND toggles.deleted_at IS NOT NULL", appID, true).
		Order("toggles.deleted_at DESC").
		Scan(&results).Error
	if err != nil {
		return nil, err
	}
	return results, nil
}

// Restore limpa deleted_at/deleted_by/archived_root deste nó e de toda a subárvore soft-apagada
// sob ele, devolvendo tudo ao estado ativo de uma vez.
func (r *ToggleRepositoryImpl) Restore(id string) error {
	children, err := r.GetChildrenUnscoped(id)
	if err != nil {
		return err
	}
	for _, child := range children {
		if err := r.Restore(child.ID); err != nil {
			return err
		}
	}
	return r.db.Unscoped().Model(&entity.Toggle{}).Where("id = ?", id).
		Updates(map[string]interface{}{"deleted_at": nil, "deleted_by": nil, "archived_root": false}).Error
}
