package usecase

import (
	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/domain/repository"
)

// ApplicationUseCase define os casos de uso para aplicações
type ApplicationUseCase struct {
	appRepo repository.ApplicationRepository
}

// NewApplicationUseCase cria uma nova instância de ApplicationUseCase
func NewApplicationUseCase(appRepo repository.ApplicationRepository) *ApplicationUseCase {
	return &ApplicationUseCase{
		appRepo: appRepo,
	}
}

// CreateApplication cria uma nova aplicação
func (uc *ApplicationUseCase) CreateApplication(name string) (*entity.Application, error) {
	if name == "" {
		return nil, entity.NewAppError(entity.ErrCodeValidation, "application name is required")
	}

	app := entity.NewApplication(name)

	// Verifica se já existe uma aplicação com o mesmo nome
	exists, err := uc.appRepo.Exists(app.ID)
	if err != nil {
		return nil, entity.NewAppError(entity.ErrCodeDatabase, "error checking application existence")
	}

	if exists {
		return nil, entity.NewAppError(entity.ErrCodeAlreadyExists, "application already exists")
	}

	err = uc.appRepo.Create(app)
	if err != nil {
		return nil, entity.NewAppError(entity.ErrCodeDatabase, "error creating application")
	}

	return app, nil
}

// GetApplicationByID busca uma aplicação por ID
func (uc *ApplicationUseCase) GetApplicationByID(id string) (*entity.Application, error) {
	if id == "" {
		return nil, entity.NewAppError(entity.ErrCodeValidation, "application ID is required")
	}

	app, err := uc.appRepo.GetByID(id)
	if err != nil {
		return nil, entity.NewAppError(entity.ErrCodeNotFound, "application not found")
	}

	return app, nil
}

// GetAllApplications busca todas as aplicações
func (uc *ApplicationUseCase) GetAllApplications() ([]*entity.Application, error) {
	apps, err := uc.appRepo.GetAll()
	if err != nil {
		return nil, entity.NewAppError(entity.ErrCodeDatabase, "error fetching applications")
	}

	return apps, nil
}

// GetAllApplicationsWithCounts busca todas as aplicações com contagem de toggles
func (uc *ApplicationUseCase) GetAllApplicationsWithCounts() ([]*entity.ApplicationWithCounts, error) {
	apps, err := uc.appRepo.GetAllWithToggleCounts()
	if err != nil {
		return nil, entity.NewAppError(entity.ErrCodeDatabase, "error fetching applications with counts")
	}

	return apps, nil
}

// UpdateApplication atualiza uma aplicação
func (uc *ApplicationUseCase) UpdateApplication(id, name string) (*entity.Application, error) {
	if id == "" {
		return nil, entity.NewAppError(entity.ErrCodeValidation, "application ID is required")
	}

	if name == "" {
		return nil, entity.NewAppError(entity.ErrCodeValidation, "application name is required")
	}

	app, err := uc.appRepo.GetByID(id)
	if err != nil {
		return nil, entity.NewAppError(entity.ErrCodeNotFound, "application not found")
	}

	app.Name = name

	err = uc.appRepo.Update(app)
	if err != nil {
		return nil, entity.NewAppError(entity.ErrCodeDatabase, "error updating application")
	}

	return app, nil
}

// DeleteApplication remove uma aplicação
func (uc *ApplicationUseCase) DeleteApplication(id string) error {
	if id == "" {
		return entity.NewAppError(entity.ErrCodeValidation, "application ID is required")
	}

	exists, err := uc.appRepo.Exists(id)
	if err != nil {
		return entity.NewAppError(entity.ErrCodeDatabase, "error checking application existence")
	}

	if !exists {
		return entity.NewAppError(entity.ErrCodeNotFound, "application not found")
	}

	err = uc.appRepo.Delete(id)
	if err != nil {
		return entity.NewAppError(entity.ErrCodeDatabase, "error deleting application")
	}

	return nil
}

// GetApplicationsWithCountsByIDs busca aplicações específicas com contagem de toggles
func (uc *ApplicationUseCase) GetApplicationsWithCountsByIDs(ids []string) ([]*entity.ApplicationWithCounts, error) {
	if len(ids) == 0 {
		return []*entity.ApplicationWithCounts{}, nil
	}

	// Implementar uma versão filtrada do GetAllApplicationsWithCounts
	// Por simplicidade, vamos obter todas e filtrar (pode ser otimizado no futuro)
	allApps, err := uc.appRepo.GetAllWithToggleCounts()
	if err != nil {
		return nil, entity.NewAppError(entity.ErrCodeDatabase, "error fetching applications with counts")
	}

	// Criar mapa para busca rápida
	idMap := make(map[string]bool)
	for _, id := range ids {
		idMap[id] = true
	}

	// Filtrar apenas as aplicações solicitadas
	var filteredApps []*entity.ApplicationWithCounts
	for _, app := range allApps {
		if idMap[app.ID] {
			filteredApps = append(filteredApps, app)
		}
	}

	return filteredApps, nil
}
