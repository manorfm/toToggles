package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/usecase"
)

func setupTestRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	return gin.New()
}

func TestApplicationHandler_CreateApplication(t *testing.T) {
	tests := []struct {
		name           string
		requestBody    map[string]interface{}
		expectedStatus int
		expectedError  string
	}{
		{
			name: "successful creation",
			requestBody: map[string]interface{}{
				"name": "Test Application",
				"team_id": "team123",
			},
			expectedStatus: http.StatusCreated,
			expectedError:  "",
		},
		{
			name: "missing name",
			requestBody: map[string]interface{}{
				"name": "",
				"team_id": "team123",
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "validation failed",
		},
		{
			name: "missing team_id",
			requestBody: map[string]interface{}{
				"name": "Test Application",
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "validation failed",
		},
		{
			name: "invalid JSON",
			requestBody: map[string]interface{}{
				"invalid": "json",
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "validation failed",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Setup
			router := setupTestRouter()
			mockRepo := usecase.NewMockApplicationRepository()
			useCase := usecase.NewApplicationUseCase(mockRepo)
			toggleMock := usecase.NewMockToggleRepository()
			toggleUseCase := usecase.NewToggleUseCase(toggleMock, mockRepo)
			teamMock := usecase.NewMockTeamRepository()
			userMock := usecase.NewMockUserRepository()
			teamUseCase := usecase.NewTeamUseCase(teamMock, userMock, mockRepo)
			
			// Add a test team to the mock
			testTeam := &entity.Team{ID: "team123", Name: "Test Team"}
			teamMock.Teams["team123"] = testTeam
			
			handler := NewApplicationHandler(useCase, toggleUseCase, teamUseCase)

			router.POST("/applications", handler.CreateApplication)

			// Create request
			jsonBody, _ := json.Marshal(tt.requestBody)
			req, _ := http.NewRequest("POST", "/applications", bytes.NewBuffer(jsonBody))
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
				var response entity.Application
				json.Unmarshal(w.Body.Bytes(), &response)
				if response.Name == "" {
					t.Error("Expected application name in response")
				}
			}
		})
	}
}

func TestApplicationHandler_GetApplication(t *testing.T) {
	tests := []struct {
		name           string
		id             string
		setupMock      func(*usecase.MockApplicationRepository)
		expectedStatus int
		expectedErrMsg string
	}{
		{
			name: "successful_retrieval",
			id:   "01JZNM42NKSANGHZ3G4KKXGCNW",
			setupMock: func(mock *usecase.MockApplicationRepository) {
				mock.Applications["01JZNM42NKSANGHZ3G4KKXGCNW"] = &entity.Application{
					ID:   "01JZNM42NKSANGHZ3G4KKXGCNW",
					Name: "Test App",
				}
			},
			expectedStatus: http.StatusOK,
			expectedErrMsg: "",
		},
		{
			name:           "empty_ID",
			id:             " ",
			setupMock:      func(mock *usecase.MockApplicationRepository) {},
			expectedStatus: http.StatusBadRequest,
			expectedErrMsg: "validation failed",
		},
		{
			name: "not_found",
			id:   "01JZNM42NKSANGHZ3G4KKXGCNX",
			setupMock: func(mock *usecase.MockApplicationRepository) {
				// No app with this ID
			},
			expectedStatus: http.StatusNotFound,
			expectedErrMsg: "application not found",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Setup
			router := setupTestRouter()
			mockRepo := usecase.NewMockApplicationRepository()
			tt.setupMock(mockRepo)
			useCase := usecase.NewApplicationUseCase(mockRepo)
			toggleMock := usecase.NewMockToggleRepository()
			toggleUseCase := usecase.NewToggleUseCase(toggleMock, mockRepo)
			teamMock := usecase.NewMockTeamRepository()
			userMock := usecase.NewMockUserRepository()
			teamUseCase := usecase.NewTeamUseCase(teamMock, userMock, mockRepo)
			handler := NewApplicationHandler(useCase, toggleUseCase, teamUseCase)

			router.GET("/applications/:id", handler.GetApplication)

			// Create request
			req, _ := http.NewRequest("GET", "/applications/"+tt.id, nil)

			// Execute request
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			// Assertions
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
				var response entity.Application
				json.Unmarshal(w.Body.Bytes(), &response)
				if response.ID != tt.id {
					t.Errorf("Expected app ID '%s', got '%s'", tt.id, response.ID)
				}
			}
		})
	}
}

func TestApplicationHandler_GetAllApplications(t *testing.T) {
	// Setup
	router := setupTestRouter()
	mockRepo := usecase.NewMockApplicationRepository()
	mockRepo.Applications = map[string]*entity.Application{
		"app1": {ID: "app1", Name: "App 1"},
		"app2": {ID: "app2", Name: "App 2"},
	}
	useCase := usecase.NewApplicationUseCase(mockRepo)
	toggleMock := usecase.NewMockToggleRepository()
	toggleUseCase := usecase.NewToggleUseCase(toggleMock, mockRepo)
	teamMock := usecase.NewMockTeamRepository()
	userMock := usecase.NewMockUserRepository()
	teamUseCase := usecase.NewTeamUseCase(teamMock, userMock, mockRepo)
	handler := NewApplicationHandler(useCase, toggleUseCase, teamUseCase)

	// Add middleware to set authenticated user
	router.Use(func(c *gin.Context) {
		testUser := &entity.User{ID: "test-user", Username: "test", Role: entity.UserRoleRoot}
		c.Set("user", testUser)
		c.Next()
	})

	router.GET("/applications", handler.GetAllApplications)

	// Create request
	req, _ := http.NewRequest("GET", "/applications", nil)

	// Execute request
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Assertions
	if w.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, w.Code)
	}

	var response []entity.Application
	json.Unmarshal(w.Body.Bytes(), &response)
	if len(response) != 2 {
		t.Errorf("Expected 2 applications, got %d", len(response))
	}
}

func TestApplicationHandler_UpdateApplication(t *testing.T) {
	tests := []struct {
		name           string
		appID          string
		requestBody    map[string]interface{}
		setupMock      func(*usecase.MockApplicationRepository)
		expectedStatus int
		expectedError  string
	}{
		{
			name:  "successful update",
			appID: "test123",
			requestBody: map[string]interface{}{
				"name": "Updated App",
			},
			setupMock: func(mock *usecase.MockApplicationRepository) {
				mock.Applications["test123"] = &entity.Application{
					ID:   "test123",
					Name: "Original Name",
				}
			},
			expectedStatus: http.StatusOK,
			expectedError:  "",
		},
		{
			name:  "empty ID",
			appID: "",
			requestBody: map[string]interface{}{
				"name": "Updated App",
			},
			setupMock:      func(mock *usecase.MockApplicationRepository) {},
			expectedStatus: http.StatusNotFound,
			expectedError:  "",
		},
		{
			name:  "empty name",
			appID: "01JZNM42NKSANGHZ3G4KKXGCNW",
			requestBody: map[string]interface{}{
				"name": "",
			},
			setupMock: func(mock *usecase.MockApplicationRepository) {
				mock.Applications["01JZNM42NKSANGHZ3G4KKXGCNW"] = &entity.Application{
					ID:   "01JZNM42NKSANGHZ3G4KKXGCNW",
					Name: "Test App",
				}
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "validation failed",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Setup
			router := setupTestRouter()
			mockRepo := usecase.NewMockApplicationRepository()
			tt.setupMock(mockRepo)
			useCase := usecase.NewApplicationUseCase(mockRepo)
			toggleMock := usecase.NewMockToggleRepository()
			toggleUseCase := usecase.NewToggleUseCase(toggleMock, mockRepo)
			teamMock := usecase.NewMockTeamRepository()
			userMock := usecase.NewMockUserRepository()
			teamUseCase := usecase.NewTeamUseCase(teamMock, userMock, mockRepo)
			handler := NewApplicationHandler(useCase, toggleUseCase, teamUseCase)

			router.PUT("/applications/:id", handler.UpdateApplication)

			// Create request
			jsonBody, _ := json.Marshal(tt.requestBody)
			req, _ := http.NewRequest("PUT", "/applications/"+tt.appID, bytes.NewBuffer(jsonBody))
			req.Header.Set("Content-Type", "application/json")

			// Execute request
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			// Assertions
			if w.Code != tt.expectedStatus {
				t.Errorf("Expected status %d, got %d", tt.expectedStatus, w.Code)
			}

			if tt.name == "empty ID" && w.Code == http.StatusNotFound && w.Body.Len() == 0 {
				return
			}

			if tt.expectedError != "" {
				var response map[string]interface{}
				json.Unmarshal(w.Body.Bytes(), &response)
				if message, exists := response["message"]; !exists || message != tt.expectedError {
					t.Errorf("Expected error message '%s', got '%v'", tt.expectedError, message)
				}
			} else if tt.name != "empty ID" {
				var response entity.Application
				json.Unmarshal(w.Body.Bytes(), &response)
				if response.Name != tt.requestBody["name"] {
					t.Errorf("Expected app name '%s', got '%s'", tt.requestBody["name"], response.Name)
				}
			}
		})
	}
}

func TestApplicationHandler_DeleteApplication(t *testing.T) {
	tests := []struct {
		name           string
		appID          string
		setupMock      func(*usecase.MockApplicationRepository)
		expectedStatus int
		expectedError  string
	}{
		{
			name:  "successful deletion",
			appID: "test123",
			setupMock: func(mock *usecase.MockApplicationRepository) {
				mock.Applications["test123"] = &entity.Application{ID: "test123", Name: "Test App"}
			},
			expectedStatus: http.StatusOK,
			expectedError:  "",
		},
		{
			name:           "empty ID",
			appID:          "",
			setupMock:      func(mock *usecase.MockApplicationRepository) {},
			expectedStatus: http.StatusNotFound,
			expectedError:  "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Setup
			router := setupTestRouter()
			mockRepo := usecase.NewMockApplicationRepository()
			tt.setupMock(mockRepo)
			useCase := usecase.NewApplicationUseCase(mockRepo)
			toggleMock := usecase.NewMockToggleRepository()
			toggleUseCase := usecase.NewToggleUseCase(toggleMock, mockRepo)
			teamMock := usecase.NewMockTeamRepository()
			userMock := usecase.NewMockUserRepository()
			teamUseCase := usecase.NewTeamUseCase(teamMock, userMock, mockRepo)
			handler := NewApplicationHandler(useCase, toggleUseCase, teamUseCase)

			router.DELETE("/applications/:id", handler.DeleteApplication)

			// Create request
			req, _ := http.NewRequest("DELETE", "/applications/"+tt.appID, nil)

			// Execute request
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			// Assertions
			if w.Code != tt.expectedStatus {
				t.Errorf("Expected status %d, got %d", tt.expectedStatus, w.Code)
			}

			if tt.name == "empty ID" && w.Code == http.StatusNotFound && w.Body.Len() == 0 {
				return
			}

			if tt.expectedError != "" {
				if w.Code == http.StatusNotFound && w.Body.Len() == 0 {
					// Aceita corpo vazio para 404
					return
				}
				var response map[string]interface{}
				json.Unmarshal(w.Body.Bytes(), &response)
				if message, exists := response["message"]; !exists || message != tt.expectedError {
					t.Errorf("Expected error message '%s', got '%v'", tt.expectedError, message)
				}
			} else if tt.name != "empty ID" {
				var response map[string]interface{}
				json.Unmarshal(w.Body.Bytes(), &response)
				if message, exists := response["message"]; !exists || message != "application deleted successfully" {
					t.Error("Expected success message")
				}
			}
		})
	}
}
