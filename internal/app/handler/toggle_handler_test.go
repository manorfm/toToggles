package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/usecase"
)

func TestToggleHandler_CreateToggle(t *testing.T) {
	tests := []struct {
		name           string
		appID          string
		requestBody    map[string]interface{}
		expectedStatus int
		expectedError  string
	}{
		{
			name:  "successful creation",
			appID: "app123",
			requestBody: map[string]interface{}{
				"toggle": "test.feature",
			},
			expectedStatus: http.StatusCreated,
			expectedError:  "",
		},
		{
			name:  "missing toggle",
			appID: "app123",
			requestBody: map[string]interface{}{
				"enabled": true,
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "invalid request body: Key: 'CreateToggleRequest.Toggle' Error:Field validation for 'Toggle' failed on the 'required' tag",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Setup
			router := setupTestRouter()
			toggleMock := usecase.NewMockToggleRepository()
			appMock := usecase.NewMockApplicationRepository()

			appMock.Applications[tt.appID] = &entity.Application{
				ID:   tt.appID,
				Name: "Test App",
			}

			toggleUseCase := usecase.NewToggleUseCase(toggleMock, appMock)
			handler := NewToggleHandler(toggleUseCase)

			router.POST("/applications/:id/toggles", handler.CreateToggle)

			// Create request
			jsonBody, _ := json.Marshal(tt.requestBody)
			req, _ := http.NewRequest("POST", "/applications/"+tt.appID+"/toggles", bytes.NewBuffer(jsonBody))
			req.Header.Set("Content-Type", "application/json")

			// Execute request
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			// Assertions
			if w.Code != tt.expectedStatus {
				t.Errorf("Expected status %d, got %d", tt.expectedStatus, w.Code)
			}

			if tt.expectedError != "" {
				var response map[string]interface{}
				json.Unmarshal(w.Body.Bytes(), &response)
				if message, exists := response["message"]; !exists || message != tt.expectedError {
					t.Errorf("Expected error message '%s', got '%v'", tt.expectedError, message)
				}
			} else {
				var response map[string]interface{}
				json.Unmarshal(w.Body.Bytes(), &response)
				if response["message"] != "toggle created successfully" {
					t.Error("Expected success message")
				}
			}
		})
	}
}

func TestToggleHandler_GetToggleStatus(t *testing.T) {
	tests := []struct {
		name           string
		appID          string
		path           string
		setupMock      func(*usecase.MockToggleRepository, *usecase.MockApplicationRepository)
		expectedStatus int
		expected       bool
		expectedError  string
	}{
		{
			name:  "enabled toggle",
			appID: "app123",
			path:  "test.feature",
			setupMock: func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {
				toggleMock.Toggles["toggle1"] = &entity.Toggle{
					ID:      "toggle1",
					Path:    "test.feature",
					AppID:   "app123",
					Enabled: true,
				}
			},
			expectedStatus: http.StatusOK,
			expected:       true,
			expectedError:  "",
		},
		{
			name:  "disabled toggle",
			appID: "app123",
			path:  "test.feature",
			setupMock: func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {
				toggleMock.Toggles["toggle1"] = &entity.Toggle{
					ID:      "toggle1",
					Path:    "test.feature",
					AppID:   "app123",
					Enabled: false,
				}
			},
			expectedStatus: http.StatusOK,
			expected:       false,
			expectedError:  "",
		},
		{
			name:           "empty path",
			appID:          "app123",
			path:           "",
			setupMock:      func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {},
			expectedStatus: http.StatusBadRequest,
			expected:       false,
			expectedError:  "toggle path is required",
		},
		{
			name:           "toggle not found",
			appID:          "app123",
			path:           "nonexistent.feature",
			setupMock:      func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {},
			expectedStatus: http.StatusNotFound,
			expected:       false,
			expectedError:  "toggle not found",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Setup
			router := setupTestRouter()
			toggleMock := usecase.NewMockToggleRepository()
			appMock := usecase.NewMockApplicationRepository()
			tt.setupMock(toggleMock, appMock)

			toggleUseCase := usecase.NewToggleUseCase(toggleMock, appMock)
			handler := NewToggleHandler(toggleUseCase)

			router.GET("/applications/:id/toggles/status", handler.GetToggleStatus)

			// Create request
			url := "/applications/" + tt.appID + "/toggles/status"
			if tt.path != "" {
				url += "?path=" + tt.path
			}
			req, _ := http.NewRequest("GET", url, nil)

			// Execute request
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			// Assertions
			if w.Code != tt.expectedStatus {
				t.Errorf("Expected status %d, got %d", tt.expectedStatus, w.Code)
			}

			if tt.expectedError != "" {
				var response map[string]interface{}
				json.Unmarshal(w.Body.Bytes(), &response)
				if message, exists := response["message"]; !exists || message != tt.expectedError {
					t.Errorf("Expected error message '%s', got '%v'", tt.expectedError, message)
				}
			} else {
				var response map[string]interface{}
				json.Unmarshal(w.Body.Bytes(), &response)
				if enabled, exists := response["enabled"]; !exists || enabled != tt.expected {
					t.Errorf("Expected enabled %v, got %v", tt.expected, enabled)
				}
			}
		})
	}
}

func TestToggleHandler_UpdateToggle(t *testing.T) {
	tests := []struct {
		name           string
		appID          string
		path           string
		requestBody    map[string]interface{}
		setupMock      func(*usecase.MockToggleRepository, *usecase.MockApplicationRepository)
		expectedStatus int
		expectedError  string
	}{
		{
			name:  "successful update",
			appID: "app123",
			path:  "test.feature",
			requestBody: map[string]interface{}{
				"enabled": false,
			},
			setupMock: func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {
				toggleMock.Toggles["toggle1"] = &entity.Toggle{
					ID:      "toggle1",
					Path:    "test.feature",
					AppID:   "app123",
					Enabled: true,
				}
			},
			expectedStatus: http.StatusOK,
			expectedError:  "",
		},
		{
			name:  "toggle not found",
			appID: "app123",
			path:  "nonexistent.feature",
			requestBody: map[string]interface{}{
				"enabled": false,
			},
			setupMock:      func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {},
			expectedStatus: http.StatusNotFound,
			expectedError:  "toggle not found",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Setup
			router := setupTestRouter()
			toggleMock := usecase.NewMockToggleRepository()
			appMock := usecase.NewMockApplicationRepository()
			tt.setupMock(toggleMock, appMock)

			toggleUseCase := usecase.NewToggleUseCase(toggleMock, appMock)
			handler := NewToggleHandler(toggleUseCase)

			router.PUT("/applications/:id/toggles", handler.UpdateToggle)

			// Create request
			url := "/applications/" + tt.appID + "/toggles"
			if tt.path != "" {
				url += "?path=" + tt.path
			}
			jsonBody, _ := json.Marshal(tt.requestBody)
			req, _ := http.NewRequest("PUT", url, bytes.NewBuffer(jsonBody))
			req.Header.Set("Content-Type", "application/json")

			// Execute request
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			// Assertions
			if w.Code != tt.expectedStatus {
				t.Errorf("Expected status %d, got %d", tt.expectedStatus, w.Code)
			}

			if tt.expectedError != "" {
				var response map[string]interface{}
				json.Unmarshal(w.Body.Bytes(), &response)
				if message, exists := response["message"]; !exists || message != tt.expectedError {
					t.Errorf("Expected error message '%s', got '%v'", tt.expectedError, message)
				}
			} else {
				var response map[string]interface{}
				json.Unmarshal(w.Body.Bytes(), &response)
				if response["message"] != "toggle updated successfully" {
					t.Error("Expected success message")
				}
			}
		})
	}
}

func TestToggleHandler_GetAllTogglesByApp(t *testing.T) {
	tests := []struct {
		name           string
		appID          string
		setupMock      func(*usecase.MockToggleRepository, *usecase.MockApplicationRepository)
		expectedStatus int
		expectedCount  int
		expectedError  string
	}{
		{
			name:  "successful retrieval",
			appID: "app123",
			setupMock: func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {
				appMock.Applications["app123"] = &entity.Application{ID: "app123", Name: "Test App"}
				toggleMock.Toggles["toggle1"] = &entity.Toggle{ID: "toggle1", AppID: "app123", Path: "test1"}
				toggleMock.Toggles["toggle2"] = &entity.Toggle{ID: "toggle2", AppID: "app123", Path: "test2"}
			},
			expectedStatus: http.StatusOK,
			expectedCount:  2,
			expectedError:  "",
		},
		{
			name:           "application not found",
			appID:          "nonexistent",
			setupMock:      func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {},
			expectedStatus: http.StatusNotFound,
			expectedCount:  0,
			expectedError:  "application not found",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Setup
			router := setupTestRouter()
			toggleMock := usecase.NewMockToggleRepository()
			appMock := usecase.NewMockApplicationRepository()
			tt.setupMock(toggleMock, appMock)

			toggleUseCase := usecase.NewToggleUseCase(toggleMock, appMock)
			handler := NewToggleHandler(toggleUseCase)

			router.GET("/applications/:id/toggles", handler.GetAllToggles)

			// Create request
			req, _ := http.NewRequest("GET", "/applications/"+tt.appID+"/toggles", nil)

			// Execute request
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			// Assertions
			if w.Code != tt.expectedStatus {
				t.Errorf("Expected status %d, got %d", tt.expectedStatus, w.Code)
			}

			if tt.expectedError != "" {
				var response map[string]interface{}
				json.Unmarshal(w.Body.Bytes(), &response)
				if message, exists := response["message"]; !exists || message != tt.expectedError {
					t.Errorf("Expected error message '%s', got '%v'", tt.expectedError, message)
				}
			} else {
				var response []entity.Toggle
				json.Unmarshal(w.Body.Bytes(), &response)
				if len(response) != tt.expectedCount {
					t.Errorf("Expected %d toggles, got %d", tt.expectedCount, len(response))
				}
			}
		})
	}
}
