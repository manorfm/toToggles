package handler

import (
	"bytes"
	"encoding/json"
	"errors"
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
		body           string
		setupMock      func(*usecase.MockToggleRepository, *usecase.MockApplicationRepository)
		expectedStatus int
		expectedError  string
	}{
		{
			name:  "successful_creation",
			appID: "01JZNM42NKSANGHZ3G4KKXGCNW",
			body:  `{"toggle": "feature.new.dashboard"}`,
			setupMock: func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {
				appMock.Applications["01JZNM42NKSANGHZ3G4KKXGCNW"] = &entity.Application{
					ID:   "01JZNM42NKSANGHZ3G4KKXGCNW",
					Name: "Test App",
				}
			},
			expectedStatus: http.StatusCreated,
			expectedError:  "",
		},
		{
			name:           "missing_toggle",
			appID:          "01JZNM42NKSANGHZ3G4KKXGCNW",
			body:           `{}`,
			setupMock:      func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "validation failed",
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

			router.POST("/applications/:id/toggles", handler.CreateToggle)

			// Create request
			req, _ := http.NewRequest("POST", "/applications/"+tt.appID+"/toggles", bytes.NewBufferString(tt.body))
			req.Header.Set("Content-Type", "application/json")

			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

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
				// Check for success message
				var response map[string]interface{}
				json.Unmarshal(w.Body.Bytes(), &response)
				if message, exists := response["message"]; !exists || message != "toggle created successfully" {
					t.Errorf("Expected success message")
				}
			}
		})
	}
}

func TestToggleHandler_GetToggleStatus(t *testing.T) {
	tests := []struct {
		name            string
		appID           string
		toggleID        string
		setupMock       func(*usecase.MockToggleRepository, *usecase.MockApplicationRepository)
		expectedStatus  int
		expectedEnabled *bool
		expectedErrMsg  string
	}{
		{
			name:     "enabled_toggle",
			appID:    "01JZNM42NKSANGHZ3G4KKXGCNW",
			toggleID: "01JZNM42NKSANGHZ3G4KKXGCNX",
			setupMock: func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {
				enabled := true
				toggleMock.Toggles["01JZNM42NKSANGHZ3G4KKXGCNX"] = &entity.Toggle{
					ID:      "01JZNM42NKSANGHZ3G4KKXGCNX",
					Value:   "test",
					Path:    "test.feature",
					Level:   0,
					Enabled: enabled,
					AppID:   "01JZNM42NKSANGHZ3G4KKXGCNW",
				}
				appMock.Applications["01JZNM42NKSANGHZ3G4KKXGCNW"] = &entity.Application{
					ID:   "01JZNM42NKSANGHZ3G4KKXGCNW",
					Name: "Test App",
				}
			},
			expectedStatus:  http.StatusOK,
			expectedEnabled: &[]bool{true}[0],
		},
		{
			name:     "disabled_toggle",
			appID:    "01JZNM42NKSANGHZ3G4KKXGCNW",
			toggleID: "01JZNM42NKSANGHZ3G4KKXGCNY",
			setupMock: func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {
				enabled := false
				toggleMock.Toggles["01JZNM42NKSANGHZ3G4KKXGCNY"] = &entity.Toggle{
					ID:      "01JZNM42NKSANGHZ3G4KKXGCNY",
					Value:   "test",
					Path:    "test.feature",
					Level:   0,
					Enabled: enabled,
					AppID:   "01JZNM42NKSANGHZ3G4KKXGCNW",
				}
				appMock.Applications["01JZNM42NKSANGHZ3G4KKXGCNW"] = &entity.Application{
					ID:   "01JZNM42NKSANGHZ3G4KKXGCNW",
					Name: "Test App",
				}
			},
			expectedStatus:  http.StatusOK,
			expectedEnabled: &[]bool{false}[0],
		},
		{
			name:     "toggle_not_found",
			appID:    "01JZNM42NKSANGHZ3G4KKXGCNW",
			toggleID: "01JZNM42NKSANGHZ3G4KKXGCNZ",
			setupMock: func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {
				appMock.Applications["01JZNM42NKSANGHZ3G4KKXGCNW"] = &entity.Application{
					ID:   "01JZNM42NKSANGHZ3G4KKXGCNW",
					Name: "Test App",
				}
			},
			expectedStatus: http.StatusNotFound,
			expectedErrMsg: "toggle not found",
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

			router.GET("/applications/:id/toggles/:toggleId", handler.GetToggleStatus)

			url := "/applications/" + tt.appID + "/toggles/" + tt.toggleID
			req, _ := http.NewRequest("GET", url, nil)

			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != tt.expectedStatus {
				t.Errorf("Expected status %d, got %d", tt.expectedStatus, w.Code)
			}

			if tt.expectedErrMsg != "" {
				var response map[string]interface{}
				json.Unmarshal(w.Body.Bytes(), &response)
				if message, exists := response["message"]; !exists || message != tt.expectedErrMsg {
					t.Errorf("Expected error message '%s', got '%v'", tt.expectedErrMsg, message)
				}
			} else {
				var response map[string]interface{}
				json.Unmarshal(w.Body.Bytes(), &response)
				if enabled, exists := response["enabled"]; !exists || enabled != *tt.expectedEnabled {
					t.Errorf("Expected enabled %v, got %v", *tt.expectedEnabled, enabled)
				}
			}
		})
	}
}

func TestToggleHandler_UpdateToggle(t *testing.T) {
	tests := []struct {
		name           string
		appID          string
		toggleID       string
		requestBody    map[string]interface{}
		setupMock      func(*usecase.MockToggleRepository, *usecase.MockApplicationRepository)
		expectedStatus int
		expectedError  string
	}{
		{
			name:     "successful update",
			appID:    "app123",
			toggleID: "toggle1",
			requestBody: map[string]interface{}{
				"enabled": false,
			},
			setupMock: func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {
				appMock.Applications["app123"] = &entity.Application{ID: "app123", Name: "Test App"}
				toggleMock.Toggles["toggle1"] = &entity.Toggle{ID: "toggle1", Path: "test.feature", AppID: "app123", Enabled: true}
			},
			expectedStatus: http.StatusOK,
			expectedError:  "",
		},
		{
			name:     "toggle not found",
			appID:    "app123",
			toggleID: "notfound",
			requestBody: map[string]interface{}{
				"enabled": false,
			},
			setupMock: func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {
				appMock.Applications["app123"] = &entity.Application{ID: "app123", Name: "Test App"}
			},
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

			router.PUT("/applications/:id/toggles/:toggleId", handler.UpdateToggle)

			url := "/applications/" + tt.appID + "/toggles/" + tt.toggleID
			jsonBody, _ := json.Marshal(tt.requestBody)
			req, _ := http.NewRequest("PUT", url, bytes.NewBuffer(jsonBody))
			req.Header.Set("Content-Type", "application/json")

			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

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

func TestToggleHandler_DeleteToggle(t *testing.T) {
	tests := []struct {
		name           string
		appID          string
		toggleID       string
		setupMock      func(*usecase.MockToggleRepository, *usecase.MockApplicationRepository)
		expectedStatus int
		expectedError  string
	}{
		{
			name:     "successful deletion",
			appID:    "app123",
			toggleID: "toggle123",
			setupMock: func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {
				toggleMock.Toggles["toggle123"] = &entity.Toggle{
					ID:      "toggle123",
					Path:    "test.feature",
					AppID:   "app123",
					Enabled: true,
				}
			},
			expectedStatus: http.StatusOK,
			expectedError:  "",
		},
		{
			name:           "empty appID",
			appID:          "",
			toggleID:       "01JZNM42NKSANGHZ3G4KKXGCNX",
			setupMock:      func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "validation failed",
		},
		{
			name:     "empty toggleID",
			appID:    "app123",
			toggleID: "empty",
			setupMock: func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {
				toggleMock.GetByIDError = errors.New("toggle not found")
			},
			expectedStatus: http.StatusNotFound,
			expectedError:  "toggle not found",
		},
		{
			name:     "toggle not found",
			appID:    "app123",
			toggleID: "nonexistent",
			setupMock: func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {
				toggleMock.GetByIDError = errors.New("toggle not found")
			},
			expectedStatus: http.StatusNotFound,
			expectedError:  "toggle not found",
		},
		{
			name:     "toggle belongs to different app",
			appID:    "app123",
			toggleID: "toggle123",
			setupMock: func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {
				toggleMock.Toggles["toggle123"] = &entity.Toggle{
					ID:      "toggle123",
					Path:    "test.feature",
					AppID:   "different-app",
					Enabled: true,
				}
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "toggle does not belong to this application",
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

			router.DELETE("/applications/:id/toggles/:toggleId", handler.DeleteToggle)

			url := "/applications/" + tt.appID + "/toggles/" + tt.toggleID
			req, _ := http.NewRequest("DELETE", url, nil)

			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

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
				if response["message"] != "toggle deleted successfully" {
					t.Error("Expected success message")
				}
				if response["id"] != tt.toggleID {
					t.Errorf("Expected toggle ID '%s', got '%v'", tt.toggleID, response["id"])
				}
			}
		})
	}
}

func TestToggleHandler_UpdateEnabled(t *testing.T) {
	tests := []struct {
		name           string
		appID          string
		toggleID       string
		requestBody    map[string]interface{}
		setupMock      func(*usecase.MockToggleRepository, *usecase.MockApplicationRepository)
		expectedStatus int
		expectedError  string
	}{
		{
			name:     "successful update",
			appID:    "app123",
			toggleID: "toggle1",
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
			name:           "empty appID",
			appID:          "",
			toggleID:       "01JZNM42NKSANGHZ3G4KKXGCNX",
			requestBody:    map[string]interface{}{"enabled": true},
			setupMock:      func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "validation failed",
		},
		{
			name:     "toggle not found",
			appID:    "app123",
			toggleID: "nonexistent",
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

			router.PUT("/applications/:id/toggle/:toggleId", handler.UpdateEnabled)

			url := "/applications/" + tt.appID + "/toggle/" + tt.toggleID
			jsonBody, _ := json.Marshal(tt.requestBody)
			req, _ := http.NewRequest("PUT", url, bytes.NewBuffer(jsonBody))
			req.Header.Set("Content-Type", "application/json")

			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

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
				if response["message"] != "toggle enabled updated successfully" {
					t.Error("Expected success message")
				}
			}
		})
	}
}

func TestToggleHandler_GetToggleStatus_Validation(t *testing.T) {
	tests := []struct {
		name           string
		appID          string
		toggleID       string
		setupMock      func(*usecase.MockToggleRepository, *usecase.MockApplicationRepository)
		expectedStatus int
		expectedError  string
	}{
		{
			name:     "enabled_toggle",
			appID:    "01JZNM42NKSANGHZ3G4KKXGCNW",
			toggleID: "01JZNM42NKSANGHZ3G4KKXGCNX",
			setupMock: func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {
				toggleMock.Toggles["01JZNM42NKSANGHZ3G4KKXGCNX"] = &entity.Toggle{
					ID:      "01JZNM42NKSANGHZ3G4KKXGCNX",
					AppID:   "01JZNM42NKSANGHZ3G4KKXGCNW",
					Path:    "feature.test",
					Enabled: true,
				}
			},
			expectedStatus: http.StatusOK,
			expectedError:  "",
		},
		{
			name:     "disabled_toggle",
			appID:    "01JZNM42NKSANGHZ3G4KKXGCNW",
			toggleID: "01JZNM42NKSANGHZ3G4KKXGCNX",
			setupMock: func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {
				toggleMock.Toggles["01JZNM42NKSANGHZ3G4KKXGCNX"] = &entity.Toggle{
					ID:      "01JZNM42NKSANGHZ3G4KKXGCNX",
					AppID:   "01JZNM42NKSANGHZ3G4KKXGCNW",
					Path:    "feature.test",
					Enabled: false,
				}
			},
			expectedStatus: http.StatusOK,
			expectedError:  "",
		},
		{
			name:           "toggle_not_found",
			appID:          "01JZNM42NKSANGHZ3G4KKXGCNW",
			toggleID:       "01JZNM42NKSANGHZ3G4KKXGCNX",
			setupMock:      func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {},
			expectedStatus: http.StatusNotFound,
			expectedError:  "toggle not found",
		},
		{
			name:           "invalid_appID",
			appID:          "invalid-id",
			toggleID:       "01JZNM42NKSANGHZ3G4KKXGCNX",
			setupMock:      func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "validation failed",
		},
		{
			name:           "invalid_toggleID",
			appID:          "01JZNM42NKSANGHZ3G4KKXGCNW",
			toggleID:       "invalid-id",
			setupMock:      func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "validation failed",
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

			router.GET("/applications/:id/toggles/:toggleId/status", handler.GetToggleStatus)

			// Create request
			req, _ := http.NewRequest("GET", "/applications/"+tt.appID+"/toggles/"+tt.toggleID+"/status", nil)

			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != tt.expectedStatus {
				t.Errorf("Expected status %d, got %d", tt.expectedStatus, w.Code)
			}

			if tt.expectedError != "" {
				var response map[string]interface{}
				json.Unmarshal(w.Body.Bytes(), &response)
				if message, exists := response["message"]; !exists || message != tt.expectedError {
					t.Errorf("Expected error message '%s', got '%v'", tt.expectedError, message)
				}
			}
		})
	}
}
