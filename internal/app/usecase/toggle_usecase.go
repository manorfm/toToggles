package usecase

import (
	"strings"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/domain/repository"
)

// ToggleUseCase define os casos de uso para toggles
type ToggleUseCase struct {
	toggleRepo repository.ToggleRepository
	appRepo    repository.ApplicationRepository
}

// NewToggleUseCase cria uma nova instância de ToggleUseCase
func NewToggleUseCase(toggleRepo repository.ToggleRepository, appRepo repository.ApplicationRepository) *ToggleUseCase {
	return &ToggleUseCase{
		toggleRepo: toggleRepo,
		appRepo:    appRepo,
	}
}

// CreateToggle cria um novo toggle com estrutura hierárquica
func (uc *ToggleUseCase) CreateToggle(path string, enabled bool, editable bool, appID string) error {
	if path == "" {
		return entity.NewAppError(entity.ErrCodeValidation, "toggle path is required")
	}

	if appID == "" {
		return entity.NewAppError(entity.ErrCodeValidation, "application ID is required")
	}

	// Verifica se a aplicação existe
	_, err := uc.appRepo.GetByID(appID)
	if err != nil {
		return entity.NewAppError(entity.ErrCodeNotFound, "application not found")
	}

	// Verifica se o toggle final já existe
	exists, err := uc.toggleRepo.Exists(path, appID)
	if err != nil {
		return entity.NewAppError(entity.ErrCodeDatabase, "error checking toggle existence")
	}

	if exists {
		return entity.NewAppError(entity.ErrCodeAlreadyExists, "toggle already exists")
	}

	// Cria a estrutura hierárquica
	parts := entity.ParseTogglePath(path)
	return uc.createToggleHierarchy(parts, enabled, editable, appID, nil, 0)
}

// createToggleHierarchy cria a estrutura hierárquica de toggles
func (uc *ToggleUseCase) createToggleHierarchy(parts []string, enabled bool, editable bool, appID string, parentID *string, level int) error {
	if level >= len(parts) {
		return nil
	}

	currentPart := parts[level]
	currentPath := strings.Join(parts[:level+1], ".")

	// Verifica se o toggle atual já existe
	existingToggle, err := uc.toggleRepo.GetByPath(currentPath, appID)
	if err == nil {
		// Toggle já existe, usa ele como pai para os próximos níveis
		if level+1 < len(parts) {
			nextParentID := existingToggle.ID
			return uc.createToggleHierarchy(parts, enabled, editable, appID, &nextParentID, level+1)
		}
		return nil
	}

	// Toggle não existe, cria ele
	// Para o toggle final (último nível), usa os parâmetros fornecidos
	// Para os toggles intermediários, usa enabled=true e editable=true
	isFinalToggle := level == len(parts)-1
	toggleEnabled := enabled
	toggleEditable := editable

	if !isFinalToggle {
		toggleEnabled = true
		toggleEditable = true
	}

	toggle := entity.NewToggle(currentPart, toggleEnabled, toggleEditable, currentPath, level, parentID, appID)

	err = uc.toggleRepo.Create(toggle)
	if err != nil {
		return entity.NewAppError(entity.ErrCodeDatabase, "error creating toggle")
	}

	// Se há mais partes, cria os filhos
	if level+1 < len(parts) {
		nextParentID := toggle.ID
		return uc.createToggleHierarchy(parts, enabled, editable, appID, &nextParentID, level+1)
	}

	return nil
}

// GetToggleStatus verifica se um toggle está habilitado
func (uc *ToggleUseCase) GetToggleStatus(path string, appID string) (bool, error) {
	if path == "" {
		return false, entity.NewAppError(entity.ErrCodeValidation, "toggle path is required")
	}

	if appID == "" {
		return false, entity.NewAppError(entity.ErrCodeValidation, "application ID is required")
	}

	// Busca o toggle específico
	toggle, err := uc.toggleRepo.GetByPath(path, appID)
	if err != nil {
		return false, entity.NewAppError(entity.ErrCodeNotFound, "toggle not found")
	}

	// Verifica se está habilitado considerando a hierarquia
	return uc.isToggleEnabled(toggle), nil
}

// isToggleEnabled verifica se um toggle está habilitado considerando a hierarquia
func (uc *ToggleUseCase) isToggleEnabled(toggle *entity.Toggle) bool {
	if !toggle.Enabled {
		return false
	}

	// Se tem pai, verifica se o pai também está habilitado
	if toggle.ParentID != nil {
		parent, err := uc.toggleRepo.GetByID(*toggle.ParentID)
		if err != nil {
			return false
		}
		return uc.isToggleEnabled(parent)
	}

	return true
}

// UpdateToggle atualiza um toggle
func (uc *ToggleUseCase) UpdateToggle(path string, enabled bool, appID string) error {
	if path == "" {
		return entity.NewAppError(entity.ErrCodeValidation, "toggle path is required")
	}

	if appID == "" {
		return entity.NewAppError(entity.ErrCodeValidation, "application ID is required")
	}

	toggle, err := uc.toggleRepo.GetByPath(path, appID)
	if err != nil {
		return entity.NewAppError(entity.ErrCodeNotFound, "toggle not found")
	}

	toggle.Enabled = enabled

	err = uc.toggleRepo.Update(toggle)
	if err != nil {
		return entity.NewAppError(entity.ErrCodeDatabase, "error updating toggle")
	}

	return nil
}

// DeleteToggle remove um toggle e seus filhos
func (uc *ToggleUseCase) DeleteToggle(path string, appID string) error {
	if path == "" {
		return entity.NewAppError(entity.ErrCodeValidation, "toggle path is required")
	}

	if appID == "" {
		return entity.NewAppError(entity.ErrCodeValidation, "application ID is required")
	}

	// Verifica se o toggle existe
	exists, err := uc.toggleRepo.Exists(path, appID)
	if err != nil {
		return entity.NewAppError(entity.ErrCodeDatabase, "error checking toggle existence")
	}

	if !exists {
		return entity.NewAppError(entity.ErrCodeNotFound, "toggle not found")
	}

	// Remove o toggle e seus filhos
	err = uc.toggleRepo.DeleteByPath(path, appID)
	if err != nil {
		return entity.NewAppError(entity.ErrCodeDatabase, "error deleting toggle")
	}

	return nil
}

// GetAllTogglesByApp busca todos os toggles de uma aplicação
func (uc *ToggleUseCase) GetAllTogglesByApp(appID string) ([]*entity.Toggle, error) {
	if appID == "" {
		return nil, entity.NewAppError(entity.ErrCodeValidation, "application ID is required")
	}

	// Verifica se a aplicação existe
	_, err := uc.appRepo.GetByID(appID)
	if err != nil {
		return nil, entity.NewAppError(entity.ErrCodeNotFound, "application not found")
	}

	toggles, err := uc.toggleRepo.GetHierarchyByAppID(appID)
	if err != nil {
		return nil, entity.NewAppError(entity.ErrCodeDatabase, "error fetching toggles")
	}

	return toggles, nil
}

// GetToggleHierarchy retorna a estrutura hierárquica dos toggles
func (uc *ToggleUseCase) GetToggleHierarchy(appID string) ([]map[string]interface{}, error) {
	if appID == "" {
		return nil, entity.NewAppError(entity.ErrCodeValidation, "application ID is required")
	}

	toggles, err := uc.toggleRepo.GetHierarchyByAppID(appID)
	if err != nil {
		return nil, entity.NewAppError(entity.ErrCodeDatabase, "error fetching toggle hierarchy")
	}

	return uc.buildHierarchyArray(toggles), nil
}

// buildHierarchyArray constrói a hierarquia como array
func (uc *ToggleUseCase) buildHierarchyArray(toggles []*entity.Toggle) []map[string]interface{} {
	var result []map[string]interface{}

	// Agrupa toggles por nível
	byLevel := make(map[int][]*entity.Toggle)
	for _, toggle := range toggles {
		byLevel[toggle.Level] = append(byLevel[toggle.Level], toggle)
	}

	// Constrói a hierarquia começando pelos toggles raiz (nível 0)
	for _, toggle := range byLevel[0] {
		result = append(result, uc.buildToggleNodeArray(toggle, byLevel))
	}

	return result
}

// buildToggleNodeArray constrói um nó da hierarquia (sem editable, value só o nome)
func (uc *ToggleUseCase) buildToggleNodeArray(toggle *entity.Toggle, byLevel map[int][]*entity.Toggle) map[string]interface{} {
	return uc.buildToggleNodeRecursiveArray(toggle, byLevel, toggle.Enabled)
}

// buildToggleNodeRecursiveArray constrói um nó propagando enabled e value só o nome
func (uc *ToggleUseCase) buildToggleNodeRecursiveArray(toggle *entity.Toggle, byLevel map[int][]*entity.Toggle, parentEnabled bool) map[string]interface{} {
	enabled := toggle.Enabled && parentEnabled

	node := map[string]interface{}{
		"id":      toggle.ID,
		"value":   toggle.Value, // apenas o nome do nível
		"enabled": enabled,
	}

	// Busca filhos
	var children []map[string]interface{}
	for _, child := range byLevel[toggle.Level+1] {
		if child.ParentID != nil && *child.ParentID == toggle.ID {
			children = append(children, uc.buildToggleNodeRecursiveArray(child, byLevel, enabled))
		}
	}

	if len(children) > 0 {
		node["toggles"] = children
	}

	return node
}

// UpdateEnabledRecursively atualiza o campo enabled do toggle e de todos os seus descendentes
func (uc *ToggleUseCase) UpdateEnabledRecursively(toggleID string, enabled bool, appID string) error {
	toggle, err := uc.toggleRepo.GetByID(toggleID)
	if err != nil {
		return entity.NewAppError(entity.ErrCodeNotFound, "toggle not found")
	}
	if toggle.AppID != appID {
		return entity.NewAppError(entity.ErrCodeValidation, "toggle does not belong to this application")
	}
	// Atualiza o próprio toggle
	toggle.Enabled = enabled
	if err := uc.toggleRepo.Update(toggle); err != nil {
		return entity.NewAppError(entity.ErrCodeDatabase, "error updating toggle")
	}
	// Atualiza recursivamente os filhos
	children, err := uc.toggleRepo.GetChildren(toggleID)
	if err != nil {
		return entity.NewAppError(entity.ErrCodeDatabase, "error fetching children")
	}
	for _, child := range children {
		if err := uc.UpdateEnabledRecursively(child.ID, enabled, appID); err != nil {
			return err
		}
	}
	return nil
}

// GetToggleByID busca um toggle por ID e appID
func (uc *ToggleUseCase) GetToggleByID(toggleID string, appID string) (*entity.Toggle, error) {
	if toggleID == "" || appID == "" {
		return nil, entity.NewAppError(entity.ErrCodeValidation, "toggle ID and application ID are required")
	}
	toggle, err := uc.toggleRepo.GetByID(toggleID)
	if err != nil {
		return nil, entity.NewAppError(entity.ErrCodeNotFound, "toggle not found")
	}
	if toggle.AppID != appID {
		return nil, entity.NewAppError(entity.ErrCodeValidation, "toggle does not belong to this application")
	}
	return toggle, nil
}

// UpdateToggleByID atualiza o enabled de um toggle por ID e appID
func (uc *ToggleUseCase) UpdateToggleByID(toggleID string, enabled bool, appID string) error {
	if toggleID == "" || appID == "" {
		return entity.NewAppError(entity.ErrCodeValidation, "toggle ID and application ID are required")
	}
	toggle, err := uc.toggleRepo.GetByID(toggleID)
	if err != nil {
		return entity.NewAppError(entity.ErrCodeNotFound, "toggle not found")
	}
	if toggle.AppID != appID {
		return entity.NewAppError(entity.ErrCodeValidation, "toggle does not belong to this application")
	}
	toggle.Enabled = enabled
	if err := uc.toggleRepo.Update(toggle); err != nil {
		return entity.NewAppError(entity.ErrCodeDatabase, "error updating toggle")
	}
	return nil
}
