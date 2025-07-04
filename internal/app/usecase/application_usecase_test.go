package usecase

import (
	"errors"
	"testing"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
)

func TestApplicationUseCase_CreateApplication(t *testing.T) {
	tests := []struct {
		name          string
		appName       string
		setupMock     func(*MockApplicationRepository)
		expectedError string
	}{
		{
			name:    "successful creation",
			appName: "Test App",
			setupMock: func(mock *MockApplicationRepository) {
				mock.CreateError = nil
			},
			expectedError: "",
		},
		{
			name:    "empty name",
			appName: "",
			setupMock: func(mock *MockApplicationRepository) {
				// No setup needed
			},
			expectedError: "application name is required",
		},
		{
			name:    "database error",
			appName: "Test App",
			setupMock: func(mock *MockApplicationRepository) {
				mock.CreateError = errors.New("database error")
			},
			expectedError: "error creating application",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockRepo := NewMockApplicationRepository()
			tt.setupMock(mockRepo)

			useCase := NewApplicationUseCase(mockRepo)
			app, err := useCase.CreateApplication(tt.appName)

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
				if app.Name != tt.appName {
					t.Errorf("Expected app name '%s', got '%s'", tt.appName, app.Name)
				}
			}
		})
	}
}

func TestApplicationUseCase_GetApplicationByID(t *testing.T) {
	tests := []struct {
		name          string
		appID         string
		setupMock     func(*MockApplicationRepository)
		expectedError string
	}{
		{
			name:  "successful retrieval",
			appID: "test123",
			setupMock: func(mock *MockApplicationRepository) {
				mock.Applications["test123"] = &entity.Application{
					ID:   "test123",
					Name: "Test App",
				}
			},
			expectedError: "",
		},
		{
			name:          "empty ID",
			appID:         "",
			setupMock:     func(mock *MockApplicationRepository) {},
			expectedError: "application ID is required",
		},
		{
			name:  "not found",
			appID: "nonexistent",
			setupMock: func(mock *MockApplicationRepository) {
				// No app with this ID
			},
			expectedError: "application not found",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockRepo := NewMockApplicationRepository()
			tt.setupMock(mockRepo)

			useCase := NewApplicationUseCase(mockRepo)
			app, err := useCase.GetApplicationByID(tt.appID)

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
				if app.ID != tt.appID {
					t.Errorf("Expected app ID '%s', got '%s'", tt.appID, app.ID)
				}
			}
		})
	}
}

func TestApplicationUseCase_GetAllApplications(t *testing.T) {
	mockRepo := NewMockApplicationRepository()
	mockRepo.Applications["app1"] = &entity.Application{ID: "app1", Name: "App 1"}
	mockRepo.Applications["app2"] = &entity.Application{ID: "app2", Name: "App 2"}

	useCase := NewApplicationUseCase(mockRepo)
	apps, err := useCase.GetAllApplications()

	if err != nil {
		t.Errorf("Expected no error, got %v", err)
		return
	}

	if len(apps) != 2 {
		t.Errorf("Expected 2 applications, got %d", len(apps))
	}
}

func TestApplicationUseCase_UpdateApplication(t *testing.T) {
	tests := []struct {
		name          string
		appID         string
		newName       string
		setupMock     func(*MockApplicationRepository)
		expectedError string
	}{
		{
			name:    "successful update",
			appID:   "test123",
			newName: "Updated App",
			setupMock: func(mock *MockApplicationRepository) {
				mock.Applications["test123"] = &entity.Application{
					ID:   "test123",
					Name: "Original Name",
				}
			},
			expectedError: "",
		},
		{
			name:          "empty ID",
			appID:         "",
			newName:       "Updated App",
			setupMock:     func(mock *MockApplicationRepository) {},
			expectedError: "application ID is required",
		},
		{
			name:          "empty name",
			appID:         "test123",
			newName:       "",
			setupMock:     func(mock *MockApplicationRepository) {},
			expectedError: "application name is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockRepo := NewMockApplicationRepository()
			tt.setupMock(mockRepo)

			useCase := NewApplicationUseCase(mockRepo)
			app, err := useCase.UpdateApplication(tt.appID, tt.newName)

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
				if app.Name != tt.newName {
					t.Errorf("Expected app name '%s', got '%s'", tt.newName, app.Name)
				}
			}
		})
	}
}

func TestApplicationUseCase_DeleteApplication(t *testing.T) {
	tests := []struct {
		name          string
		appID         string
		setupMock     func(*MockApplicationRepository)
		expectedError string
	}{
		{
			name:  "successful deletion",
			appID: "test123",
			setupMock: func(mock *MockApplicationRepository) {
				mock.Applications["test123"] = &entity.Application{ID: "test123", Name: "Test App"}
			},
			expectedError: "",
		},
		{
			name:          "empty ID",
			appID:         "",
			setupMock:     func(mock *MockApplicationRepository) {},
			expectedError: "application ID is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockRepo := NewMockApplicationRepository()
			tt.setupMock(mockRepo)

			useCase := NewApplicationUseCase(mockRepo)
			err := useCase.DeleteApplication(tt.appID)

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
