package usecase

import (
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
					ID:       "toggle1",
					Path:     "test.path",
					AppID:    "app123",
					Enabled:  true,
					Editable: true,
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
					ID:       "toggle1",
					Path:     "test.path",
					AppID:    "app123",
					Enabled:  false,
					Editable: true,
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
					ID:       "toggle1",
					Path:     "test.path",
					AppID:    "app123",
					Enabled:  true,
					Editable: true,
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
