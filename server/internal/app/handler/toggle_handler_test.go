package handler

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
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
			handler := NewToggleHandler(toggleUseCase, usecase.NewApplicationUseCase(appMock, toggleMock), newTestAuditUseCase())

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
			handler := NewToggleHandler(toggleUseCase, usecase.NewApplicationUseCase(appMock, toggleMock), newTestAuditUseCase())

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
			handler := NewToggleHandler(toggleUseCase, usecase.NewApplicationUseCase(appMock, toggleMock), newTestAuditUseCase())

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
				// Check if toggle data is returned (successful update)
				if response["id"] == nil {
					t.Errorf("Expected toggle data in response, got: %v", response)
				}
				if response["path"] != "test.feature" {
					t.Errorf("Expected path 'test.feature', got: %v", response["path"])
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
			handler := NewToggleHandler(toggleUseCase, usecase.NewApplicationUseCase(appMock, toggleMock), newTestAuditUseCase())

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
		{
			// v2.6 §3.4/4.1: apagar um nó com filhos deixou de ser recusado — vira uma exclusão
			// recursiva (soft-delete) de toda a subárvore, sem erro. Ver
			// TestToggleHandler_DeleteToggle_RecursivelyDeletesChildren logo abaixo pra confirmar
			// que o filho também some (a asserção genérica desta tabela só checa a resposta HTTP).
			name:     "toggle with children is deleted recursively, not refused",
			appID:    "app123",
			toggleID: "toggle123",
			setupMock: func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {
				parentID := "toggle123"
				toggleMock.Toggles["toggle123"] = &entity.Toggle{
					ID:      "toggle123",
					Path:    "test.feature",
					AppID:   "app123",
					Enabled: true,
				}
				toggleMock.Toggles["child456"] = &entity.Toggle{
					ID:       "child456",
					Path:     "test.feature.child",
					AppID:    "app123",
					Enabled:  true,
					ParentID: &parentID,
				}
			},
			expectedStatus: http.StatusOK,
			expectedError:  "",
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
			handler := NewToggleHandler(toggleUseCase, usecase.NewApplicationUseCase(appMock, toggleMock), newTestAuditUseCase())

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

// Confirma que o DELETE HTTP realmente cascateia pro filho (soft-delete), não só que a resposta
// HTTP foi 200 — e que o registro na raiz do arquivamento carrega quem apagou.
func TestToggleHandler_DeleteToggle_RecursivelyDeletesChildrenAndRecordsDeleter(t *testing.T) {
	router := setupTestRouter()
	toggleMock := usecase.NewMockToggleRepository()
	appMock := usecase.NewMockApplicationRepository()
	parentID := "toggle123"
	toggleMock.Toggles["toggle123"] = &entity.Toggle{ID: "toggle123", Path: "test.feature", AppID: "app123", Enabled: true}
	toggleMock.Toggles["child456"] = &entity.Toggle{ID: "child456", Path: "test.feature.child", AppID: "app123", Enabled: true, ParentID: &parentID}

	toggleUseCase := usecase.NewToggleUseCase(toggleMock, appMock)
	handler := NewToggleHandler(toggleUseCase, usecase.NewApplicationUseCase(appMock, toggleMock), newTestAuditUseCase())
	router.Use(func(c *gin.Context) {
		c.Set("user", &entity.User{ID: "deleter-1", Username: "deleter"})
		c.Next()
	})
	router.DELETE("/applications/:id/toggles/:toggleId", handler.DeleteToggle)

	req, _ := http.NewRequest("DELETE", "/applications/app123/toggles/toggle123", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	if _, err := toggleMock.GetByID("child456"); err == nil {
		t.Error("expected child to be soft-deleted along with its parent")
	}
	archivedRoot, err := toggleMock.GetByIDUnscoped("toggle123")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if archivedRoot.DeletedBy == nil || *archivedRoot.DeletedBy != "deleter-1" {
		t.Errorf("expected DeletedBy 'deleter-1', got %v", archivedRoot.DeletedBy)
	}
}

func TestToggleHandler_RestoreToggle(t *testing.T) {
	router := setupTestRouter()
	toggleMock := usecase.NewMockToggleRepository()
	appMock := usecase.NewMockApplicationRepository()
	toggleUseCase := usecase.NewToggleUseCase(toggleMock, appMock)
	handler := NewToggleHandler(toggleUseCase, usecase.NewApplicationUseCase(appMock, toggleMock), newTestAuditUseCase())
	router.DELETE("/applications/:id/toggles/:toggleId", handler.DeleteToggle)
	router.POST("/applications/:id/toggles/:toggleId/restore", handler.RestoreToggle)

	toggleMock.Toggles["toggle123"] = &entity.Toggle{ID: "toggle123", Path: "test.feature", AppID: "app123", Enabled: true}
	delReq, _ := http.NewRequest("DELETE", "/applications/app123/toggles/toggle123", nil)
	delW := httptest.NewRecorder()
	router.ServeHTTP(delW, delReq)
	if delW.Code != http.StatusOK {
		t.Fatalf("setup: expected delete to succeed, got %d: %s", delW.Code, delW.Body.String())
	}

	req, _ := http.NewRequest("POST", "/applications/app123/toggles/toggle123/restore", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if _, err := toggleMock.GetByID("toggle123"); err != nil {
		t.Errorf("expected toggle to be visible again after restore, got error: %v", err)
	}
}

func TestToggleHandler_RestoreToggle_NotFound(t *testing.T) {
	router := setupTestRouter()
	toggleMock := usecase.NewMockToggleRepository()
	appMock := usecase.NewMockApplicationRepository()
	toggleUseCase := usecase.NewToggleUseCase(toggleMock, appMock)
	handler := NewToggleHandler(toggleUseCase, usecase.NewApplicationUseCase(appMock, toggleMock), newTestAuditUseCase())
	router.POST("/applications/:id/toggles/:toggleId/restore", handler.RestoreToggle)

	req, _ := http.NewRequest("POST", "/applications/app123/toggles/nonexistent/restore", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d: %s", w.Code, w.Body.String())
	}
}

func TestToggleHandler_GetArchivedToggles(t *testing.T) {
	router := setupTestRouter()
	toggleMock := usecase.NewMockToggleRepository()
	appMock := usecase.NewMockApplicationRepository()
	toggleUseCase := usecase.NewToggleUseCase(toggleMock, appMock)
	handler := NewToggleHandler(toggleUseCase, usecase.NewApplicationUseCase(appMock, toggleMock), newTestAuditUseCase())
	router.DELETE("/applications/:id/toggles/:toggleId", handler.DeleteToggle)
	router.GET("/applications/:id/toggles/archived", handler.GetArchivedToggles)

	toggleMock.Toggles["toggle123"] = &entity.Toggle{ID: "toggle123", Path: "test.feature", AppID: "app123", Enabled: true}
	delReq, _ := http.NewRequest("DELETE", "/applications/app123/toggles/toggle123", nil)
	delW := httptest.NewRecorder()
	router.ServeHTTP(delW, delReq)
	if delW.Code != http.StatusOK {
		t.Fatalf("setup: expected delete to succeed, got %d: %s", delW.Code, delW.Body.String())
	}

	req, _ := http.NewRequest("GET", "/applications/app123/toggles/archived", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var response struct {
		Toggles []struct {
			ID   string `json:"id"`
			Path string `json:"path"`
		} `json:"toggles"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if len(response.Toggles) != 1 || response.Toggles[0].ID != "toggle123" {
		t.Errorf("expected exactly the deleted toggle in the archived list, got %+v", response.Toggles)
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
			handler := NewToggleHandler(toggleUseCase, usecase.NewApplicationUseCase(appMock, toggleMock), newTestAuditUseCase())

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
				// Check if toggle data is returned (successful update)
				if response["id"] == nil {
					t.Errorf("Expected toggle data in response, got: %v", response)
				}
				// Check if the toggle has expected properties
				if response["app_id"] != "app123" {
					t.Errorf("Expected app_id 'app123', got: %v", response["app_id"])
				}
			}
		})
	}
}

// v2.6 §6.5: seleção múltipla — liga/desliga o bit próprio de várias folhas numa chamada só,
// nunca recursivo (diferente de UpdateEnabled, testado acima).
func TestToggleHandler_BulkUpdateEnabled(t *testing.T) {
	t.Run("flips only the own bit of every listed toggle", func(t *testing.T) {
		router := setupTestRouter()
		toggleMock := usecase.NewMockToggleRepository()
		appMock := usecase.NewMockApplicationRepository()
		appMock.Applications["app123"] = &entity.Application{ID: "app123", Name: "Test App"}
		toggleMock.Toggles["leaf1"] = &entity.Toggle{ID: "leaf1", AppID: "app123", Path: "a.leaf1", Enabled: false}
		toggleMock.Toggles["leaf2"] = &entity.Toggle{ID: "leaf2", AppID: "app123", Path: "b.leaf2", Enabled: false}
		toggleUseCase := usecase.NewToggleUseCase(toggleMock, appMock)
		handler := NewToggleHandler(toggleUseCase, usecase.NewApplicationUseCase(appMock, toggleMock), newTestAuditUseCase())
		router.PUT("/applications/:id/toggles/bulk", handler.BulkUpdateEnabled)

		body, _ := json.Marshal(map[string]interface{}{"toggle_ids": []string{"leaf1", "leaf2"}, "enabled": true})
		req, _ := http.NewRequest("PUT", "/applications/app123/toggles/bulk", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
		if !toggleMock.Toggles["leaf1"].Enabled || !toggleMock.Toggles["leaf2"].Enabled {
			t.Error("expected both listed toggles to be enabled")
		}
	})

	t.Run("400 when appID is missing", func(t *testing.T) {
		router := setupTestRouter()
		toggleUseCase := usecase.NewToggleUseCase(usecase.NewMockToggleRepository(), usecase.NewMockApplicationRepository())
		handler := NewToggleHandler(toggleUseCase, usecase.NewApplicationUseCase(usecase.NewMockApplicationRepository(), usecase.NewMockToggleRepository()), newTestAuditUseCase())
		router.PUT("/toggles/bulk", handler.BulkUpdateEnabled)

		body, _ := json.Marshal(map[string]interface{}{"toggle_ids": []string{"x"}, "enabled": true})
		req, _ := http.NewRequest("PUT", "/toggles/bulk", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", w.Code)
		}
	})

	t.Run("400 when a listed toggle belongs to a different application", func(t *testing.T) {
		router := setupTestRouter()
		toggleMock := usecase.NewMockToggleRepository()
		appMock := usecase.NewMockApplicationRepository()
		appMock.Applications["app123"] = &entity.Application{ID: "app123", Name: "Test App"}
		toggleMock.Toggles["mine"] = &entity.Toggle{ID: "mine", AppID: "app123", Path: "a.mine", Enabled: false}
		toggleMock.Toggles["other"] = &entity.Toggle{ID: "other", AppID: "another-app", Path: "x.y", Enabled: false}
		toggleUseCase := usecase.NewToggleUseCase(toggleMock, appMock)
		handler := NewToggleHandler(toggleUseCase, usecase.NewApplicationUseCase(appMock, toggleMock), newTestAuditUseCase())
		router.PUT("/applications/:id/toggles/bulk", handler.BulkUpdateEnabled)

		body, _ := json.Marshal(map[string]interface{}{"toggle_ids": []string{"mine", "other"}, "enabled": true})
		req, _ := http.NewRequest("PUT", "/applications/app123/toggles/bulk", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d: %s", w.Code, w.Body.String())
		}
	})
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
			handler := NewToggleHandler(toggleUseCase, usecase.NewApplicationUseCase(appMock, toggleMock), newTestAuditUseCase())

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

func TestToggleHandler_UpdateToggleWithActivationRules(t *testing.T) {
	tests := []struct {
		name           string
		appID          string
		toggleID       string
		body           string
		setupMock      func(*usecase.MockToggleRepository, *usecase.MockApplicationRepository)
		expectedStatus int
		expectedError  string
	}{
		{
			name:     "successful_update_with_percentage_rule",
			appID:    "app123",
			toggleID: "toggle123",
			body: `{
				"enabled": true,
				"has_activation_rule": true,
				"activation_rule": {
					"type": "percentage",
					"value": "50"
				}
			}`,
			setupMock: func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {
				toggle := &entity.Toggle{
					ID:      "toggle123",
					Value:   "test",
					Enabled: false,
					Path:    "test.feature",
					Level:   0,
					AppID:   "app123",
				}
				toggleMock.Toggles["toggle123"] = toggle
			},
			expectedStatus: http.StatusOK,
			expectedError:  "",
		},
		{
			name:     "successful_update_with_parameter_rule",
			appID:    "app123",
			toggleID: "toggle123",
			body: `{
				"enabled": true,
				"has_activation_rule": true,
				"activation_rule": {
					"type": "parameter",
					"value": "premium"
				}
			}`,
			setupMock: func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {
				toggle := &entity.Toggle{
					ID:      "toggle123",
					Value:   "test",
					Enabled: false,
					Path:    "test.feature",
					Level:   0,
					AppID:   "app123",
				}
				toggleMock.Toggles["toggle123"] = toggle
			},
			expectedStatus: http.StatusOK,
			expectedError:  "",
		},
		{
			name:     "successful_update_clear_activation_rule",
			appID:    "app123",
			toggleID: "toggle123",
			body: `{
				"enabled": true,
				"has_activation_rule": false,
				"activation_rule": null
			}`,
			setupMock: func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {
				toggle := &entity.Toggle{
					ID:                "toggle123",
					Value:             "test",
					Enabled:           false,
					Path:              "test.feature",
					Level:             0,
					AppID:             "app123",
					HasActivationRule: true,
					ActivationRule: &entity.ActivationRule{
						Type:  entity.ActivationRuleTypePercentage,
						Value: "75",
					},
				}
				toggleMock.Toggles["toggle123"] = toggle
			},
			expectedStatus: http.StatusOK,
			expectedError:  "",
		},
		{
			name:     "invalid_rule_type",
			appID:    "app123",
			toggleID: "toggle123",
			body: `{
				"enabled": true,
				"has_activation_rule": true,
				"activation_rule": {
					"type": "invalid_type",
					"value": "test"
				}
			}`,
			setupMock: func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {
				toggle := &entity.Toggle{
					ID:      "toggle123",
					Value:   "test",
					Enabled: false,
					Path:    "test.feature",
					Level:   0,
					AppID:   "app123",
				}
				toggleMock.Toggles["toggle123"] = toggle
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "tipo de regra inválido: invalid_type",
		},
		{
			name:     "empty_rule_value",
			appID:    "app123",
			toggleID: "toggle123",
			body: `{
				"enabled": true,
				"has_activation_rule": true,
				"activation_rule": {
					"type": "percentage",
					"value": ""
				}
			}`,
			setupMock: func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {
				toggle := &entity.Toggle{
					ID:      "toggle123",
					Value:   "test",
					Enabled: false,
					Path:    "test.feature",
					Level:   0,
					AppID:   "app123",
				}
				toggleMock.Toggles["toggle123"] = toggle
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "valor de porcentagem é obrigatório",
		},
		{
			name:     "toggle_not_found",
			appID:    "app123",
			toggleID: "nonexistent",
			body: `{
				"enabled": true,
				"has_activation_rule": false
			}`,
			setupMock:      func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {},
			expectedStatus: http.StatusNotFound,
			expectedError:  "toggle not found",
		},
		{
			name:     "toggle_belongs_to_different_app",
			appID:    "app123",
			toggleID: "toggle123",
			body: `{
				"enabled": true,
				"has_activation_rule": false
			}`,
			setupMock: func(toggleMock *usecase.MockToggleRepository, appMock *usecase.MockApplicationRepository) {
				toggle := &entity.Toggle{
					ID:      "toggle123",
					Value:   "test",
					Enabled: false,
					Path:    "test.feature",
					Level:   0,
					AppID:   "different_app", // Different app ID
				}
				toggleMock.Toggles["toggle123"] = toggle
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
			handler := NewToggleHandler(toggleUseCase, usecase.NewApplicationUseCase(appMock, toggleMock), newTestAuditUseCase())

			router.PUT("/applications/:id/toggles/:toggleId", handler.UpdateToggle)

			// Create request
			req, _ := http.NewRequest("PUT", "/applications/"+tt.appID+"/toggles/"+tt.toggleID, bytes.NewBuffer([]byte(tt.body)))
			req.Header.Set("Content-Type", "application/json")

			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != tt.expectedStatus {
				t.Errorf("Expected status %d, got %d. Response: %s", tt.expectedStatus, w.Code, w.Body.String())
			}

			if tt.expectedError != "" {
				var response map[string]interface{}
				json.Unmarshal(w.Body.Bytes(), &response)
				if message, exists := response["message"]; !exists || message != tt.expectedError {
					t.Errorf("Expected error message '%s', got '%v'", tt.expectedError, message)
				}
			}

			// For successful updates, verify that the rule was properly set/cleared
			if tt.expectedStatus == http.StatusOK {
				toggle := toggleMock.Toggles[tt.toggleID]
				if toggle == nil {
					t.Errorf("Toggle should exist after successful update")
					return
				}

				var requestBody UpdateToggleRequest
				json.Unmarshal([]byte(tt.body), &requestBody)

				if toggle.HasActivationRule != requestBody.HasActivationRule {
					t.Errorf("Expected HasActivationRule %v, got %v", requestBody.HasActivationRule, toggle.HasActivationRule)
				}

				if requestBody.HasActivationRule && requestBody.ActivationRule != nil {
					if toggle.ActivationRule == nil {
						t.Errorf("Expected ActivationRule to be set")
					} else {
						if toggle.ActivationRule.Type != requestBody.ActivationRule.Type {
							t.Errorf("Expected rule type %s, got %s", requestBody.ActivationRule.Type, toggle.ActivationRule.Type)
						}
						if toggle.ActivationRule.Value != requestBody.ActivationRule.Value {
							t.Errorf("Expected rule value %s, got %s", requestBody.ActivationRule.Value, toggle.ActivationRule.Value)
						}
					}
				} else if !requestBody.HasActivationRule {
					if toggle.ActivationRule != nil {
						t.Errorf("Expected ActivationRule to be nil when HasActivationRule is false")
					}
				}
			}
		})
	}
}
