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
	// Delete apaga o toggle e toda a subárvore em cascata — desde v2.6 §4.1 é um soft-delete
	// (Toggle.DeletedAt), não remoção física; ver MarkDeletionMeta/Restore/GetArchivedRootsByAppID
	// pro ciclo completo de arquivamento/restauração.
	Delete(id string) error
	Exists(path string, appID string) (bool, error)
	GetChildren(parentID string) ([]*entity.Toggle, error)

	// MarkDeletionMeta grava quem apagou e marca este nó (só ele, não a subárvore) como a raiz
	// do arquivamento — chamado ANTES de Delete, sobre a mesma linha que Delete vai soft-apagar.
	MarkDeletionMeta(id string, deletedBy string) error
	// GetByIDUnscoped busca um toggle mesmo que esteja soft-apagado — usado pra validar/restaurar
	// uma entrada arquivada.
	GetByIDUnscoped(id string) (*entity.Toggle, error)
	// GetChildrenUnscoped inclui filhos soft-apagados — usado pra caminhar a subárvore arquivada
	// inteira ao restaurar (Restore) ou checar colisão de path antes de restaurar.
	GetChildrenUnscoped(parentID string) ([]*entity.Toggle, error)
	// GetArchivedRootsByAppID lista as raízes de arquivamento (ArchivedRoot=true, soft-apagadas)
	// de uma aplicação — um item por operação de exclusão, não um item por nó da subárvore, com
	// o nome de quem apagou já resolvido via join.
	GetArchivedRootsByAppID(appID string) ([]*entity.ArchivedToggle, error)
	// Restore limpa DeletedAt/DeletedBy/ArchivedRoot deste nó e de toda a subárvore soft-apagada
	// sob ele (via GetChildrenUnscoped), devolvendo tudo ao estado ativo de uma vez.
	Restore(id string) error
}
