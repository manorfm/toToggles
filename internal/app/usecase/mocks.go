package usecase

import (
	"errors"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
)

type MockApplicationRepository struct {
	Applications map[string]*entity.Application
	CreateError  error
	GetByIDError error
	ExistsError  error
	UpdateError  error
	DeleteError  error
}

func NewMockApplicationRepository() *MockApplicationRepository {
	return &MockApplicationRepository{
		Applications: make(map[string]*entity.Application),
	}
}

func (m *MockApplicationRepository) Create(app *entity.Application) error {
	if m.CreateError != nil {
		return m.CreateError
	}
	m.Applications[app.ID] = app
	return nil
}

func (m *MockApplicationRepository) GetByID(id string) (*entity.Application, error) {
	if m.GetByIDError != nil {
		return nil, m.GetByIDError
	}
	app, exists := m.Applications[id]
	if !exists {
		return nil, errors.New("application not found")
	}
	return app, nil
}

func (m *MockApplicationRepository) GetAll() ([]*entity.Application, error) {
	apps := make([]*entity.Application, 0, len(m.Applications))
	for _, app := range m.Applications {
		apps = append(apps, app)
	}
	return apps, nil
}

func (m *MockApplicationRepository) GetAllWithToggleCounts() ([]*entity.ApplicationWithCounts, error) {
	var apps []*entity.ApplicationWithCounts
	for _, app := range m.Applications {
		apps = append(apps, &entity.ApplicationWithCounts{
			ID:              app.ID,
			Name:            app.Name,
			CreatedAt:       app.CreatedAt,
			UpdatedAt:       app.UpdatedAt,
			TotalToggles:    0, // Mock não conta toggles
			EnabledToggles:  0,
			DisabledToggles: 0,
		})
	}
	return apps, nil
}

func (m *MockApplicationRepository) Update(app *entity.Application) error {
	if m.UpdateError != nil {
		return m.UpdateError
	}
	m.Applications[app.ID] = app
	return nil
}

func (m *MockApplicationRepository) Delete(id string) error {
	if m.DeleteError != nil {
		return m.DeleteError
	}
	delete(m.Applications, id)
	return nil
}

func (m *MockApplicationRepository) Exists(id string) (bool, error) {
	if m.ExistsError != nil {
		return false, m.ExistsError
	}
	_, exists := m.Applications[id]
	return exists, nil
}

type MockToggleRepository struct {
	Toggles        map[string]*entity.Toggle
	CreateError    error
	GetByIDError   error
	GetByPathError error
	UpdateError    error
	DeleteError    error
	ExistsError    error
}

func NewMockToggleRepository() *MockToggleRepository {
	return &MockToggleRepository{
		Toggles: make(map[string]*entity.Toggle),
	}
}

func (m *MockToggleRepository) Create(toggle *entity.Toggle) error {
	if m.CreateError != nil {
		return m.CreateError
	}
	m.Toggles[toggle.ID] = toggle
	return nil
}

func (m *MockToggleRepository) GetByID(id string) (*entity.Toggle, error) {
	if m.GetByIDError != nil {
		return nil, m.GetByIDError
	}
	toggle, exists := m.Toggles[id]
	if !exists {
		return nil, errors.New("toggle not found")
	}
	return toggle, nil
}

func (m *MockToggleRepository) GetByPath(path string, appID string) (*entity.Toggle, error) {
	if m.GetByPathError != nil {
		return nil, m.GetByPathError
	}
	for _, toggle := range m.Toggles {
		if toggle.Path == path && toggle.AppID == appID {
			return toggle, nil
		}
	}
	return nil, errors.New("toggle not found")
}

func (m *MockToggleRepository) GetByAppID(appID string) ([]*entity.Toggle, error) {
	var toggles []*entity.Toggle
	for _, toggle := range m.Toggles {
		if toggle.AppID == appID {
			toggles = append(toggles, toggle)
		}
	}
	return toggles, nil
}

func (m *MockToggleRepository) GetHierarchyByAppID(appID string) ([]*entity.Toggle, error) {
	return m.GetByAppID(appID)
}

func (m *MockToggleRepository) Update(toggle *entity.Toggle) error {
	if m.UpdateError != nil {
		return m.UpdateError
	}
	m.Toggles[toggle.ID] = toggle
	return nil
}

func (m *MockToggleRepository) Delete(id string) error {
	if m.DeleteError != nil {
		return m.DeleteError
	}
	delete(m.Toggles, id)
	return nil
}

func (m *MockToggleRepository) DeleteByPath(path string, appID string) error {
	for _, toggle := range m.Toggles {
		if toggle.Path == path && toggle.AppID == appID {
			return m.Delete(toggle.ID)
		}
	}
	return errors.New("toggle not found")
}

func (m *MockToggleRepository) Exists(path string, appID string) (bool, error) {
	if m.ExistsError != nil {
		return false, m.ExistsError
	}
	for _, toggle := range m.Toggles {
		if toggle.Path == path && toggle.AppID == appID {
			return true, nil
		}
	}
	return false, nil
}

func (m *MockToggleRepository) GetChildren(parentID string) ([]*entity.Toggle, error) {
	var children []*entity.Toggle
	for _, toggle := range m.Toggles {
		if toggle.ParentID != nil && *toggle.ParentID == parentID {
			children = append(children, toggle)
		}
	}
	return children, nil
}
