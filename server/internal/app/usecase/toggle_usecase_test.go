package usecase

import (
	"errors"
	"testing"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
)

func TestToggleUseCase_CreateToggle(t *testing.T) {
	tests := []struct {
		name          string
		path          string
		enabled       bool
		appID         string
		setupMock     func(*MockToggleRepository, *MockApplicationRepository)
		expectedError string
	}{
		{
			name:    "successful creation",
			path:    "esse.campo.pode",
			enabled: true,
			appID:   "app123",
			setupMock: func(toggleMock *MockToggleRepository, appMock *MockApplicationRepository) {
				appMock.Applications["app123"] = &entity.Application{ID: "app123", Name: "Test App"}
			},
			expectedError: "",
		},
		{
			name:          "empty path",
			path:          "",
			enabled:       true,
			appID:         "app123",
			setupMock:     func(toggleMock *MockToggleRepository, appMock *MockApplicationRepository) {},
			expectedError: "toggle path is required",
		},
		{
			name:          "empty appID",
			path:          "test.path",
			enabled:       true,
			appID:         "",
			setupMock:     func(toggleMock *MockToggleRepository, appMock *MockApplicationRepository) {},
			expectedError: "application ID is required",
		},
		{
			name:    "application not found",
			path:    "test.path",
			enabled: true,
			appID:   "nonexistent",
			setupMock: func(toggleMock *MockToggleRepository, appMock *MockApplicationRepository) {
				// No app with this ID
			},
			expectedError: "application not found",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			toggleMock := NewMockToggleRepository()
			appMock := NewMockApplicationRepository()
			tt.setupMock(toggleMock, appMock)

			useCase := NewToggleUseCase(toggleMock, appMock)
			err := useCase.CreateToggle(tt.path, tt.enabled, true, tt.appID)

			if tt.expectedError != "" {
				if err == nil {
					t.Errorf("Expected error containing '%s', got nil", tt.expectedError)
					return
				}
				appErr, ok := err.(*entity.AppError)
				if !ok {
					t.Errorf("Expected AppError, got %T", err)
					return
				}
				if appErr.Message != tt.expectedError {
					t.Errorf("Expected error message '%s', got '%s'", tt.expectedError, appErr.Message)
				}
			} else {
				if err != nil {
					t.Errorf("Expected no error, got %v", err)
				}
			}
		})
	}
}

func TestToggleUseCase_GetToggleStatus(t *testing.T) {
	tests := []struct {
		name          string
		path          string
		appID         string
		setupMock     func(*MockToggleRepository, *MockApplicationRepository)
		expected      bool
		expectedError string
	}{
		{
			name:  "enabled toggle",
			path:  "test.path",
			appID: "app123",
			setupMock: func(toggleMock *MockToggleRepository, appMock *MockApplicationRepository) {
				toggleMock.Toggles["toggle1"] = &entity.Toggle{
					ID:      "toggle1",
					Path:    "test.path",
					AppID:   "app123",
					Enabled: true,
				}
			},
			expected:      true,
			expectedError: "",
		},
		{
			name:  "disabled toggle",
			path:  "test.path",
			appID: "app123",
			setupMock: func(toggleMock *MockToggleRepository, appMock *MockApplicationRepository) {
				toggleMock.Toggles["toggle1"] = &entity.Toggle{
					ID:      "toggle1",
					Path:    "test.path",
					AppID:   "app123",
					Enabled: false,
				}
			},
			expected:      false,
			expectedError: "",
		},
		{
			name:          "empty path",
			path:          "",
			appID:         "app123",
			setupMock:     func(toggleMock *MockToggleRepository, appMock *MockApplicationRepository) {},
			expected:      false,
			expectedError: "toggle path is required",
		},
		{
			name:          "toggle not found",
			path:          "nonexistent.path",
			appID:         "app123",
			setupMock:     func(toggleMock *MockToggleRepository, appMock *MockApplicationRepository) {},
			expected:      false,
			expectedError: "toggle not found",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			toggleMock := NewMockToggleRepository()
			appMock := NewMockApplicationRepository()
			tt.setupMock(toggleMock, appMock)

			useCase := NewToggleUseCase(toggleMock, appMock)
			result, err := useCase.GetToggleStatus(tt.path, tt.appID)

			if tt.expectedError != "" {
				if err == nil {
					t.Errorf("Expected error containing '%s', got nil", tt.expectedError)
					return
				}
				appErr, ok := err.(*entity.AppError)
				if !ok {
					t.Errorf("Expected AppError, got %T", err)
					return
				}
				if appErr.Message != tt.expectedError {
					t.Errorf("Expected error message '%s', got '%s'", tt.expectedError, appErr.Message)
				}
			} else {
				if err != nil {
					t.Errorf("Expected no error, got %v", err)
					return
				}
				if result != tt.expected {
					t.Errorf("Expected %v, got %v", tt.expected, result)
				}
			}
		})
	}
}

func TestToggleUseCase_UpdateToggle(t *testing.T) {
	tests := []struct {
		name          string
		path          string
		enabled       bool
		appID         string
		setupMock     func(*MockToggleRepository, *MockApplicationRepository)
		expectedError string
	}{
		{
			name:    "successful update",
			path:    "test.path",
			enabled: false,
			appID:   "app123",
			setupMock: func(toggleMock *MockToggleRepository, appMock *MockApplicationRepository) {
				toggleMock.Toggles["toggle1"] = &entity.Toggle{
					ID:      "toggle1",
					Path:    "test.path",
					AppID:   "app123",
					Enabled: true,
				}
			},
			expectedError: "",
		},
		{
			name:          "toggle not found",
			path:          "nonexistent.path",
			enabled:       false,
			appID:         "app123",
			setupMock:     func(toggleMock *MockToggleRepository, appMock *MockApplicationRepository) {},
			expectedError: "toggle not found",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			toggleMock := NewMockToggleRepository()
			appMock := NewMockApplicationRepository()
			tt.setupMock(toggleMock, appMock)

			useCase := NewToggleUseCase(toggleMock, appMock)
			err := useCase.UpdateToggle(tt.path, tt.enabled, tt.appID)

			if tt.expectedError != "" {
				if err == nil {
					t.Errorf("Expected error containing '%s', got nil", tt.expectedError)
					return
				}
				appErr, ok := err.(*entity.AppError)
				if !ok {
					t.Errorf("Expected AppError, got %T", err)
					return
				}
				if appErr.Message != tt.expectedError {
					t.Errorf("Expected error message '%s', got '%s'", tt.expectedError, appErr.Message)
				}
			} else {
				if err != nil {
					t.Errorf("Expected no error, got %v", err)
					return
				}
				// Verify the toggle was updated
				toggle, _ := toggleMock.GetByPath(tt.path, tt.appID)
				if toggle.Enabled != tt.enabled {
					t.Errorf("Expected toggle enabled %v, got %v", tt.enabled, toggle.Enabled)
				}
			}
		})
	}
}

func TestToggleUseCase_GetAllTogglesByApp(t *testing.T) {
	tests := []struct {
		name          string
		appID         string
		setupMock     func(*MockToggleRepository, *MockApplicationRepository)
		expectedCount int
		expectedError string
	}{
		{
			name:  "successful retrieval",
			appID: "app123",
			setupMock: func(toggleMock *MockToggleRepository, appMock *MockApplicationRepository) {
				appMock.Applications["app123"] = &entity.Application{ID: "app123", Name: "Test App"}
				toggleMock.Toggles["toggle1"] = &entity.Toggle{ID: "toggle1", AppID: "app123", Path: "test1"}
				toggleMock.Toggles["toggle2"] = &entity.Toggle{ID: "toggle2", AppID: "app123", Path: "test2"}
			},
			expectedCount: 2,
			expectedError: "",
		},
		{
			name:          "application not found",
			appID:         "nonexistent",
			setupMock:     func(toggleMock *MockToggleRepository, appMock *MockApplicationRepository) {},
			expectedCount: 0,
			expectedError: "application not found",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			toggleMock := NewMockToggleRepository()
			appMock := NewMockApplicationRepository()
			tt.setupMock(toggleMock, appMock)

			useCase := NewToggleUseCase(toggleMock, appMock)
			toggles, err := useCase.GetAllTogglesByApp(tt.appID)

			if tt.expectedError != "" {
				if err == nil {
					t.Errorf("Expected error containing '%s', got nil", tt.expectedError)
					return
				}
				appErr, ok := err.(*entity.AppError)
				if !ok {
					t.Errorf("Expected AppError, got %T", err)
					return
				}
				if appErr.Message != tt.expectedError {
					t.Errorf("Expected error message '%s', got '%s'", tt.expectedError, appErr.Message)
				}
			} else {
				if err != nil {
					t.Errorf("Expected no error, got %v", err)
					return
				}
				if len(toggles) != tt.expectedCount {
					t.Errorf("Expected %d toggles, got %d", tt.expectedCount, len(toggles))
				}
			}
		})
	}
}

func TestToggleUseCase_GetToggleByID(t *testing.T) {
	toggleMock := NewMockToggleRepository()
	appMock := NewMockApplicationRepository()
	appID := "app123"
	toggleID := "toggle1"
	appMock.Applications[appID] = &entity.Application{ID: appID, Name: "Test App"}
	toggleMock.Toggles[toggleID] = &entity.Toggle{ID: toggleID, AppID: appID, Path: "test.path", Enabled: true}
	useCase := NewToggleUseCase(toggleMock, appMock)

	toggle, err := useCase.GetToggleByID(toggleID, appID)
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}
	if toggle == nil || toggle.ID != toggleID {
		t.Errorf("Expected toggle with ID %s", toggleID)
	}

	_, err = useCase.GetToggleByID("notfound", appID)
	if err == nil {
		t.Errorf("Expected error for not found toggle")
	}

	_, err = useCase.GetToggleByID(toggleID, "wrongapp")
	if err == nil {
		t.Errorf("Expected error for wrong appID")
	}
}

func TestToggleUseCase_UpdateToggleByID(t *testing.T) {
	toggleMock := NewMockToggleRepository()
	appMock := NewMockApplicationRepository()
	appID := "app123"
	toggleID := "toggle1"
	appMock.Applications[appID] = &entity.Application{ID: appID, Name: "Test App"}
	toggleMock.Toggles[toggleID] = &entity.Toggle{ID: toggleID, AppID: appID, Path: "test.path", Enabled: false}
	useCase := NewToggleUseCase(toggleMock, appMock)

	err := useCase.UpdateToggleByID(toggleID, true, appID)
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}
	if !toggleMock.Toggles[toggleID].Enabled {
		t.Errorf("Expected toggle to be enabled")
	}

	err = useCase.UpdateToggleByID("notfound", true, appID)
	if err == nil {
		t.Errorf("Expected error for not found toggle")
	}

	err = useCase.UpdateToggleByID(toggleID, true, "wrongapp")
	if err == nil {
		t.Errorf("Expected error for wrong appID")
	}
}

// v2.6 §6.5: seleção múltipla → uma chamada só, flipando o bit PRÓPRIO de cada folha (nunca
// recursivo — diferente de UpdateEnabledRecursively/PUT .../toggle/:id, que também desce pra
// descendentes). Reusa UpdateToggleByID pra cada ID em vez de duplicar a mesma validação
// (appID/existência) — UpdateToggleByID não tinha nenhum chamador real antes desta fase.
func TestToggleUseCase_BulkUpdateEnabled(t *testing.T) {
	appID := "app123"

	t.Run("flips only the own bit of every listed toggle, not its descendants", func(t *testing.T) {
		toggleMock := NewMockToggleRepository()
		appMock := NewMockApplicationRepository()
		appMock.Applications[appID] = &entity.Application{ID: appID, Name: "Test App"}
		toggleMock.Toggles["leaf1"] = &entity.Toggle{ID: "leaf1", AppID: appID, Path: "a.leaf1", Enabled: false}
		toggleMock.Toggles["leaf2"] = &entity.Toggle{ID: "leaf2", AppID: appID, Path: "b.leaf2", Enabled: false}
		toggleMock.Toggles["untouched"] = &entity.Toggle{ID: "untouched", AppID: appID, Path: "c.untouched", Enabled: false}
		useCase := NewToggleUseCase(toggleMock, appMock)

		if err := useCase.BulkUpdateEnabled([]string{"leaf1", "leaf2"}, true, appID); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if !toggleMock.Toggles["leaf1"].Enabled || !toggleMock.Toggles["leaf2"].Enabled {
			t.Error("expected both listed toggles to be enabled")
		}
		if toggleMock.Toggles["untouched"].Enabled {
			t.Error("expected a toggle not in the list to be untouched")
		}
	})

	t.Run("returns a validation error for an empty list", func(t *testing.T) {
		useCase := NewToggleUseCase(NewMockToggleRepository(), NewMockApplicationRepository())

		if err := useCase.BulkUpdateEnabled(nil, true, appID); err == nil {
			t.Error("expected an error for an empty toggle_ids list")
		}
	})

	t.Run("errors when a listed toggle belongs to a different application", func(t *testing.T) {
		toggleMock := NewMockToggleRepository()
		appMock := NewMockApplicationRepository()
		appMock.Applications[appID] = &entity.Application{ID: appID, Name: "Test App"}
		toggleMock.Toggles["mine"] = &entity.Toggle{ID: "mine", AppID: appID, Path: "a.mine", Enabled: false}
		toggleMock.Toggles["other-apps"] = &entity.Toggle{ID: "other-apps", AppID: "another-app", Path: "x.y", Enabled: false}
		useCase := NewToggleUseCase(toggleMock, appMock)

		if err := useCase.BulkUpdateEnabled([]string{"mine", "other-apps"}, true, appID); err == nil {
			t.Error("expected an error when a toggle belongs to a different application")
		}
	})
}

func TestToggleUseCase_GetToggleHierarchy(t *testing.T) {
	tests := []struct {
		name          string
		appID         string
		setupMock     func(*MockToggleRepository, *MockApplicationRepository)
		expectedError string
	}{
		{
			name:  "successful hierarchy retrieval",
			appID: "app123",
			setupMock: func(toggleMock *MockToggleRepository, appMock *MockApplicationRepository) {
				toggleMock.Toggles["toggle1"] = &entity.Toggle{
					ID:      "toggle1",
					Path:    "parent",
					AppID:   "app123",
					Value:   "parent",
					Level:   0,
					Enabled: true,
				}
				toggleMock.Toggles["toggle2"] = &entity.Toggle{
					ID:       "toggle2",
					Path:     "parent.child",
					AppID:    "app123",
					Value:    "child",
					Level:    1,
					ParentID: &[]string{"toggle1"}[0],
					Enabled:  true,
				}
			},
			expectedError: "",
		},
		{
			name:          "empty appID",
			appID:         "",
			setupMock:     func(toggleMock *MockToggleRepository, appMock *MockApplicationRepository) {},
			expectedError: "application ID is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			toggleMock := NewMockToggleRepository()
			appMock := NewMockApplicationRepository()
			tt.setupMock(toggleMock, appMock)

			useCase := NewToggleUseCase(toggleMock, appMock)
			hierarchy, err := useCase.GetToggleHierarchy(tt.appID)

			if tt.expectedError != "" {
				if err == nil {
					t.Errorf("Expected error containing '%s', got nil", tt.expectedError)
					return
				}
				appErr, ok := err.(*entity.AppError)
				if !ok {
					t.Errorf("Expected AppError, got %T", err)
					return
				}
				if appErr.Message != tt.expectedError {
					t.Errorf("Expected error message '%s', got '%s'", tt.expectedError, appErr.Message)
				}
			} else {
				if err != nil {
					t.Errorf("Expected no error, got %v", err)
					return
				}
				if hierarchy == nil {
					t.Error("Expected hierarchy to be returned")
				}
			}
		})
	}
}

func TestToggleUseCase_buildHierarchyArray(t *testing.T) {
	useCase := NewToggleUseCase(nil, nil)

	toggles := []*entity.Toggle{
		{
			ID:      "parent",
			Path:    "parent",
			Value:   "parent",
			Level:   0,
			Enabled: true,
		},
		{
			ID:       "child",
			Path:     "parent.child",
			Value:    "child",
			Level:    1,
			ParentID: &[]string{"parent"}[0],
			Enabled:  true,
		},
	}

	result := useCase.buildHierarchyArray(toggles)

	if len(result) == 0 {
		t.Error("Expected hierarchy array to be built")
	}

	if len(result) != 1 {
		t.Errorf("Expected 1 root node, got %d", len(result))
	}

	parent := result[0]
	if parent["value"] != "parent" {
		t.Errorf("Expected parent value 'parent', got %v", parent["value"])
	}
}

func TestToggleUseCase_buildToggleNodeArray(t *testing.T) {
	useCase := NewToggleUseCase(nil, nil)

	toggle := &entity.Toggle{
		ID:      "test",
		Path:    "test",
		Value:   "test",
		Level:   0,
		Enabled: true,
	}

	byLevel := map[int][]*entity.Toggle{
		0: {toggle},
	}

	result := useCase.buildToggleNodeArray(toggle, byLevel)

	if result["value"] != "test" {
		t.Errorf("Expected value 'test', got %v", result["value"])
	}

	if result["enabled"] != true {
		t.Errorf("Expected enabled true, got %v", result["enabled"])
	}
}

func TestToggleUseCase_buildToggleNodeRecursiveArray(t *testing.T) {
	useCase := NewToggleUseCase(nil, nil)

	parent := &entity.Toggle{
		ID:      "parent",
		Path:    "parent",
		Value:   "parent",
		Level:   0,
		Enabled: true,
	}

	child := &entity.Toggle{
		ID:       "child",
		Path:     "parent.child",
		Value:    "child",
		Level:    1,
		ParentID: &[]string{"parent"}[0],
		Enabled:  true,
	}

	byLevel := map[int][]*entity.Toggle{
		0: {parent},
		1: {child},
	}

	result := useCase.buildToggleNodeRecursiveArray(parent, byLevel, true)

	if result["value"] != "parent" {
		t.Errorf("Expected parent value 'parent', got %v", result["value"])
	}

	if result["enabled"] != true {
		t.Errorf("Expected enabled true, got %v", result["enabled"])
	}

	children, ok := result["toggles"].([]map[string]interface{})
	if !ok {
		t.Error("Expected children to be present")
	}

	if len(children) != 1 {
		t.Errorf("Expected 1 child, got %d", len(children))
	}

	if children[0]["value"] != "child" {
		t.Errorf("Expected child value 'child', got %v", children[0]["value"])
	}
}

func TestToggleUseCase_UpdateEnabledRecursively(t *testing.T) {
	tests := []struct {
		name          string
		toggleID      string
		enabled       bool
		appID         string
		setupMock     func(*MockToggleRepository, *MockApplicationRepository)
		expectedError string
	}{
		{
			name:     "successful recursive update",
			toggleID: "toggle1",
			enabled:  false,
			appID:    "app123",
			setupMock: func(toggleMock *MockToggleRepository, appMock *MockApplicationRepository) {
				toggleMock.Toggles["toggle1"] = &entity.Toggle{
					ID:      "toggle1",
					Path:    "parent",
					AppID:   "app123",
					Value:   "parent",
					Level:   0,
					Enabled: true,
				}
				toggleMock.Toggles["toggle2"] = &entity.Toggle{
					ID:       "toggle2",
					Path:     "parent.child",
					AppID:    "app123",
					Value:    "child",
					Level:    1,
					ParentID: &[]string{"toggle1"}[0],
					Enabled:  true,
				}
			},
			expectedError: "",
		},
		{
			name:          "toggle not found",
			toggleID:      "nonexistent",
			enabled:       false,
			appID:         "app123",
			setupMock:     func(toggleMock *MockToggleRepository, appMock *MockApplicationRepository) {},
			expectedError: "toggle not found",
		},
		{
			name:     "wrong appID",
			toggleID: "toggle1",
			enabled:  false,
			appID:    "wrongapp",
			setupMock: func(toggleMock *MockToggleRepository, appMock *MockApplicationRepository) {
				toggleMock.Toggles["toggle1"] = &entity.Toggle{
					ID:      "toggle1",
					Path:    "parent",
					AppID:   "app123",
					Value:   "parent",
					Level:   0,
					Enabled: true,
				}
			},
			expectedError: "toggle does not belong to this application",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			toggleMock := NewMockToggleRepository()
			appMock := NewMockApplicationRepository()
			tt.setupMock(toggleMock, appMock)

			useCase := NewToggleUseCase(toggleMock, appMock)
			err := useCase.UpdateEnabledRecursively(tt.toggleID, tt.enabled, tt.appID)

			if tt.expectedError != "" {
				if err == nil {
					t.Errorf("Expected error containing '%s', got nil", tt.expectedError)
					return
				}
				appErr, ok := err.(*entity.AppError)
				if !ok {
					t.Errorf("Expected AppError, got %T", err)
					return
				}
				if appErr.Message != tt.expectedError {
					t.Errorf("Expected error message '%s', got '%s'", tt.expectedError, appErr.Message)
				}
			} else {
				if err != nil {
					t.Errorf("Expected no error, got %v", err)
				}
			}
		})
	}
}

func TestToggleUseCase_DeleteToggleByID(t *testing.T) {
	tests := []struct {
		name          string
		toggleID      string
		appID         string
		setupMock     func(*MockToggleRepository, *MockApplicationRepository)
		expectedError string
	}{
		{
			name:     "successful deletion",
			toggleID: "toggle123",
			appID:    "app123",
			setupMock: func(toggleMock *MockToggleRepository, appMock *MockApplicationRepository) {
				toggleMock.Toggles["toggle123"] = &entity.Toggle{
					ID:      "toggle123",
					Path:    "test.path",
					AppID:   "app123",
					Enabled: true,
				}
			},
			expectedError: "",
		},
		{
			name:          "toggle not found",
			toggleID:      "nonexistent",
			appID:         "app123",
			setupMock:     func(toggleMock *MockToggleRepository, appMock *MockApplicationRepository) {},
			expectedError: "toggle not found",
		},
		{
			name:          "empty toggleID",
			toggleID:      "",
			appID:         "app123",
			setupMock:     func(toggleMock *MockToggleRepository, appMock *MockApplicationRepository) {},
			expectedError: "toggle ID and application ID are required",
		},
		{
			name:          "empty appID",
			toggleID:      "toggle123",
			appID:         "",
			setupMock:     func(toggleMock *MockToggleRepository, appMock *MockApplicationRepository) {},
			expectedError: "toggle ID and application ID are required",
		},
		{
			name:     "toggle belongs to different app",
			toggleID: "toggle123",
			appID:    "app123",
			setupMock: func(toggleMock *MockToggleRepository, appMock *MockApplicationRepository) {
				toggleMock.Toggles["toggle123"] = &entity.Toggle{
					ID:      "toggle123",
					Path:    "test.path",
					AppID:   "different-app",
					Enabled: true,
				}
			},
			expectedError: "toggle does not belong to this application",
		},
		{
			name:     "database error during deletion",
			toggleID: "toggle123",
			appID:    "app123",
			setupMock: func(toggleMock *MockToggleRepository, appMock *MockApplicationRepository) {
				toggleMock.Toggles["toggle123"] = &entity.Toggle{
					ID:      "toggle123",
					Path:    "test.path",
					AppID:   "app123",
					Enabled: true,
				}
				toggleMock.DeleteError = errors.New("database error")
			},
			expectedError: "error deleting toggle",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			toggleMock := NewMockToggleRepository()
			appMock := NewMockApplicationRepository()
			tt.setupMock(toggleMock, appMock)

			useCase := NewToggleUseCase(toggleMock, appMock)
			err := useCase.DeleteToggleByID(tt.toggleID, tt.appID, "deleter-1")

			if tt.expectedError != "" {
				if err == nil {
					t.Errorf("Expected error containing '%s', got nil", tt.expectedError)
					return
				}
				appErr, ok := err.(*entity.AppError)
				if !ok {
					t.Errorf("Expected AppError, got %T", err)
					return
				}
				if appErr.Message != tt.expectedError {
					t.Errorf("Expected error message '%s', got '%s'", tt.expectedError, appErr.Message)
				}
			} else {
				if err != nil {
					t.Errorf("Expected no error, got %v", err)
				}
			}
		})
	}
}

// v2.6 §3.4/4.1: apagar um nó com filhos deixou de ser recusado — vira uma exclusão recursiva
// (soft-delete) de toda a subárvore descendente, marcando só o nó clicado como ArchivedRoot.
func TestToggleUseCase_DeleteToggleByID_RecursivelyDeletesWholeSubtree(t *testing.T) {
	toggleMock := NewMockToggleRepository()
	appMock := NewMockApplicationRepository()
	appID := "app123"

	// root -> a -> b -> c
	root := &entity.Toggle{ID: "root", AppID: appID, Value: "root"}
	a := &entity.Toggle{ID: "a", AppID: appID, Value: "a", ParentID: &root.ID}
	b := &entity.Toggle{ID: "b", AppID: appID, Value: "b", ParentID: &a.ID}
	c := &entity.Toggle{ID: "c", AppID: appID, Value: "c", ParentID: &b.ID}

	toggleMock.Toggles[root.ID] = root
	toggleMock.Toggles[a.ID] = a
	toggleMock.Toggles[b.ID] = b
	toggleMock.Toggles[c.ID] = c

	useCase := NewToggleUseCase(toggleMock, appMock)

	if err := useCase.DeleteToggleByID("a", appID, "deleter-1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// a, b, c (a e toda a subárvore) somem das leituras normais...
	if _, err := useCase.GetToggleByID("a", appID); err == nil {
		t.Error("expected 'a' to be soft-deleted")
	}
	if _, err := useCase.GetToggleByID("b", appID); err == nil {
		t.Error("expected 'b' to be soft-deleted (descendant)")
	}
	if _, err := useCase.GetToggleByID("c", appID); err == nil {
		t.Error("expected 'c' to be soft-deleted (descendant)")
	}
	// ...mas continuam existindo fisicamente (soft-delete), com "a" marcado como a raiz.
	archivedA, err := toggleMock.GetByIDUnscoped("a")
	if err != nil {
		t.Fatalf("expected 'a' to still exist unscoped: %v", err)
	}
	if !archivedA.ArchivedRoot {
		t.Error("expected 'a' (the node the caller targeted) to be ArchivedRoot")
	}
	if archivedA.DeletedBy == nil || *archivedA.DeletedBy != "deleter-1" {
		t.Errorf("expected DeletedBy 'deleter-1', got %v", archivedA.DeletedBy)
	}
	archivedB, err := toggleMock.GetByIDUnscoped("b")
	if err != nil {
		t.Fatalf("expected 'b' to still exist unscoped: %v", err)
	}
	if archivedB.ArchivedRoot {
		t.Error("expected 'b' (cascaded descendant, not the target) to NOT be ArchivedRoot")
	}
}

// Sem bubble-up: apagar um nó nunca sobe removendo ancestrais que ficaram sem filhos — esse
// comportamento existia só porque a exclusão era restrita a folhas (não é mais o caso, ver acima).
// root permanece intacto e visível mesmo perdendo seu único filho.
func TestToggleUseCase_DeleteToggleByID_NeverTouchesAncestors(t *testing.T) {
	toggleMock := NewMockToggleRepository()
	appMock := NewMockApplicationRepository()
	appID := "app123"

	root := &entity.Toggle{ID: "root", AppID: appID, Value: "root"}
	a := &entity.Toggle{ID: "a", AppID: appID, Value: "a", ParentID: &root.ID}

	toggleMock.Toggles[root.ID] = root
	toggleMock.Toggles[a.ID] = a

	useCase := NewToggleUseCase(toggleMock, appMock)

	if err := useCase.DeleteToggleByID("a", appID, "deleter-1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if _, err := useCase.GetToggleByID("root", appID); err != nil {
		t.Errorf("expected root to remain untouched, got error: %v", err)
	}
}

func TestToggleUseCase_UpdateToggleWithRule(t *testing.T) {
	appMock := NewMockApplicationRepository()
	toggleMock := NewMockToggleRepository()
	useCase := NewToggleUseCase(toggleMock, appMock)

	appID := "app123"
	toggleID := "toggle123"

	tests := []struct {
		name              string
		setupToggle       *entity.Toggle
		enabled           bool
		hasActivationRule bool
		activationRule    *entity.ActivationRule
		expectError       bool
		errorMsg          string
	}{
		{
			name: "successful_update_with_percentage_rule",
			setupToggle: &entity.Toggle{
				ID:      toggleID,
				Value:   "test",
				Enabled: false,
				Path:    "test.feature",
				Level:   0,
				AppID:   appID,
			},
			enabled:           true,
			hasActivationRule: true,
			activationRule: &entity.ActivationRule{
				Type:  entity.ActivationRuleTypePercentage,
				Value: "50",
			},
			expectError: false,
		},
		{
			name: "successful_update_with_parameter_rule",
			setupToggle: &entity.Toggle{
				ID:      toggleID,
				Value:   "test",
				Enabled: false,
				Path:    "test.feature",
				Level:   0,
				AppID:   appID,
			},
			enabled:           true,
			hasActivationRule: true,
			activationRule: &entity.ActivationRule{
				Type:  entity.ActivationRuleTypeParameter,
				Value: "premium",
			},
			expectError: false,
		},
		{
			name: "successful_update_clear_activation_rule",
			setupToggle: &entity.Toggle{
				ID:                toggleID,
				Value:             "test",
				Enabled:           true,
				Path:              "test.feature",
				Level:             0,
				AppID:             appID,
				HasActivationRule: true,
				ActivationRule: &entity.ActivationRule{
					Type:  entity.ActivationRuleTypePercentage,
					Value: "75",
				},
			},
			enabled:           true,
			hasActivationRule: false,
			activationRule:    nil,
			expectError:       false,
		},
		{
			name: "invalid_rule_empty_value",
			setupToggle: &entity.Toggle{
				ID:      toggleID,
				Value:   "test",
				Enabled: false,
				Path:    "test.feature",
				Level:   0,
				AppID:   appID,
			},
			enabled:           true,
			hasActivationRule: true,
			activationRule: &entity.ActivationRule{
				Type:  entity.ActivationRuleTypePercentage,
				Value: "",
			},
			expectError: true,
			errorMsg:    "valor de porcentagem é obrigatório",
		},
		{
			name: "invalid_rule_type",
			setupToggle: &entity.Toggle{
				ID:      toggleID,
				Value:   "test",
				Enabled: false,
				Path:    "test.feature",
				Level:   0,
				AppID:   appID,
			},
			enabled:           true,
			hasActivationRule: true,
			activationRule: &entity.ActivationRule{
				Type:  entity.ActivationRuleType("invalid"),
				Value: "test",
			},
			expectError: true,
			errorMsg:    "tipo de regra inválido: invalid",
		},
		{
			name:              "toggle_not_found",
			setupToggle:       nil, // No toggle in mock
			enabled:           true,
			hasActivationRule: false,
			activationRule:    nil,
			expectError:       true,
			errorMsg:          "toggle not found",
		},
		{
			name: "toggle_belongs_to_different_app",
			setupToggle: &entity.Toggle{
				ID:      toggleID,
				Value:   "test",
				Enabled: false,
				Path:    "test.feature",
				Level:   0,
				AppID:   "different_app", // Different app ID
			},
			enabled:           true,
			hasActivationRule: false,
			activationRule:    nil,
			expectError:       true,
			errorMsg:          "toggle does not belong to this application",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Reset mocks
			toggleMock.Toggles = make(map[string]*entity.Toggle)

			// Setup toggle if provided
			if tt.setupToggle != nil {
				toggleMock.Toggles[toggleID] = tt.setupToggle
			}

			// Execute the method
			_, err := useCase.UpdateToggleWithRule(toggleID, tt.enabled, tt.hasActivationRule, tt.activationRule, appID)

			// Check error expectations
			if tt.expectError {
				if err == nil {
					t.Errorf("Expected error but got none")
					return
				}
				if appErr, ok := err.(*entity.AppError); ok {
					if appErr.Message != tt.errorMsg {
						t.Errorf("Expected error message '%s', got '%s'", tt.errorMsg, appErr.Message)
					}
				} else {
					t.Errorf("Expected AppError but got: %v", err)
				}
			} else {
				if err != nil {
					t.Errorf("Expected no error but got: %v", err)
					return
				}

				// Verify the toggle was updated correctly
				updatedToggle := toggleMock.Toggles[toggleID]
				if updatedToggle == nil {
					t.Errorf("Toggle should exist after successful update")
					return
				}

				if updatedToggle.Enabled != tt.enabled {
					t.Errorf("Expected Enabled %v, got %v", tt.enabled, updatedToggle.Enabled)
				}

				if updatedToggle.HasActivationRule != tt.hasActivationRule {
					t.Errorf("Expected HasActivationRule %v, got %v", tt.hasActivationRule, updatedToggle.HasActivationRule)
				}

				if tt.hasActivationRule && tt.activationRule != nil {
					if updatedToggle.ActivationRule == nil {
						t.Errorf("Expected ActivationRule to be set")
					} else {
						if updatedToggle.ActivationRule.Type != tt.activationRule.Type {
							t.Errorf("Expected rule type %s, got %s", tt.activationRule.Type, updatedToggle.ActivationRule.Type)
						}
						if updatedToggle.ActivationRule.Value != tt.activationRule.Value {
							t.Errorf("Expected rule value %s, got %s", tt.activationRule.Value, updatedToggle.ActivationRule.Value)
						}
					}
				} else {
					if updatedToggle.ActivationRule != nil {
						t.Errorf("Expected ActivationRule to be nil when not setting activation rule")
					}
				}
			}
		})
	}
}

func TestToggleUseCase_UpdateToggleWithRule_EdgeCases(t *testing.T) {
	appMock := NewMockApplicationRepository()
	toggleMock := NewMockToggleRepository()
	useCase := NewToggleUseCase(toggleMock, appMock)

	t.Run("empty_toggle_id", func(t *testing.T) {
		_, err := useCase.UpdateToggleWithRule("", true, false, nil, "app123")
		if err == nil {
			t.Errorf("Expected error for empty toggle ID")
		}
		if appErr, ok := err.(*entity.AppError); ok {
			if appErr.Message != "toggle ID and application ID are required" {
				t.Errorf("Expected specific error message, got: %s", appErr.Message)
			}
		}
	})

	t.Run("empty_app_id", func(t *testing.T) {
		_, err := useCase.UpdateToggleWithRule("toggle123", true, false, nil, "")
		if err == nil {
			t.Errorf("Expected error for empty app ID")
		}
		if appErr, ok := err.(*entity.AppError); ok {
			if appErr.Message != "toggle ID and application ID are required" {
				t.Errorf("Expected specific error message, got: %s", appErr.Message)
			}
		}
	})

	t.Run("has_activation_rule_true_but_nil_rule", func(t *testing.T) {
		toggleID := "toggle123"
		appID := "app123"
		
		toggle := &entity.Toggle{
			ID:      toggleID,
			Value:   "test",
			Enabled: false,
			Path:    "test.feature",
			Level:   0,
			AppID:   appID,
		}
		toggleMock.Toggles[toggleID] = toggle

		_, err := useCase.UpdateToggleWithRule(toggleID, true, true, nil, appID)
		if err != nil {
			t.Errorf("Expected no error when hasActivationRule is true but rule is nil, got: %v", err)
		}

		// Should clear the activation rule
		updatedToggle := toggleMock.Toggles[toggleID]
		if updatedToggle.HasActivationRule {
			t.Errorf("Expected HasActivationRule to be false when rule is nil")
		}
		if updatedToggle.ActivationRule != nil {
			t.Errorf("Expected ActivationRule to be nil")
		}
	})
}

// AncestorBlocker sustenta o sufixo "(no effect — X is off)" no evento de auditoria de
// habilitar um toggle via drawer (v2.6 §3.3) — só olha o bit PRÓPRIO de cada ancestral (nunca o
// do próprio nó), nomeando o mais próximo da raiz que estiver desligado.
func TestToggleUseCase_AncestorBlocker(t *testing.T) {
	appMock := NewMockApplicationRepository()
	toggleMock := NewMockToggleRepository()
	useCase := NewToggleUseCase(toggleMock, appMock)

	blockedRoot := &entity.Toggle{ID: "blocked-root", Value: "user", Path: "user", Enabled: false}
	blockedMid := &entity.Toggle{ID: "blocked-mid", Value: "payments", Path: "user.payments", ParentID: &blockedRoot.ID, Enabled: true}
	blockedLeaf := &entity.Toggle{ID: "blocked-leaf", Value: "card", Path: "user.payments.card", ParentID: &blockedMid.ID, Enabled: true}
	okRoot := &entity.Toggle{ID: "ok-root", Value: "billing", Path: "billing", Enabled: true}
	okMid := &entity.Toggle{ID: "ok-mid", Value: "invoices", Path: "billing.invoices", ParentID: &okRoot.ID, Enabled: true}
	for _, tg := range []*entity.Toggle{blockedRoot, blockedMid, blockedLeaf, okRoot, okMid} {
		toggleMock.Toggles[tg.ID] = tg
	}

	t.Run("names the topmost (closest to the root) disabled ancestor", func(t *testing.T) {
		ok, blocker := useCase.AncestorBlocker(blockedLeaf)
		if ok {
			t.Error("expected ok=false, an ancestor is off")
		}
		if blocker != "user" {
			t.Errorf("expected blocker %q, got %q", "user", blocker)
		}
	})

	t.Run("is ok when every ancestor above it is on", func(t *testing.T) {
		ok, blocker := useCase.AncestorBlocker(okMid)
		if !ok {
			t.Errorf("expected ok=true, got blocker %q", blocker)
		}
		if blocker != "" {
			t.Errorf("expected empty blocker, got %q", blocker)
		}
	})

	t.Run("is ok for a root-level toggle (no ancestors at all)", func(t *testing.T) {
		ok, blocker := useCase.AncestorBlocker(okRoot)
		if !ok {
			t.Errorf("expected ok=true for a root-level toggle, got blocker %q", blocker)
		}
		if blocker != "" {
			t.Errorf("expected empty blocker, got %q", blocker)
		}
	})
}
