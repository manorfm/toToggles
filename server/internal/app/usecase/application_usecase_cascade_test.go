package usecase

import (
	"testing"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
)

func TestApplicationUseCase_DeleteApplication_CascadeDelete(t *testing.T) {
	// Setup
	mockAppRepo := NewMockApplicationRepository()
	mockToggleRepo := NewMockToggleRepository()
	
	appID := "test-app-123"
	app := &entity.Application{ID: appID, Name: "Test App"}
	mockAppRepo.Applications[appID] = app
	
	// Create test toggles
	toggle1 := &entity.Toggle{ID: "toggle1", Path: "feature.test", AppID: appID}
	toggle2 := &entity.Toggle{ID: "toggle2", Path: "feature.test.sub", AppID: appID}
	toggle3 := &entity.Toggle{ID: "toggle3", Path: "other", AppID: appID}
	
	mockToggleRepo.Toggles["toggle1"] = toggle1
	mockToggleRepo.Toggles["toggle2"] = toggle2
	mockToggleRepo.Toggles["toggle3"] = toggle3
	
	// Toggles are associated through the AppID field - no need to explicitly add to a mapping
	
	useCase := NewApplicationUseCase(mockAppRepo, mockToggleRepo)
	
	t.Run("should delete application and all associated toggles", func(t *testing.T) {
		// Execute
		err := useCase.DeleteApplication(appID)
		
		// Verify
		if err != nil {
			t.Errorf("Expected no error, got %v", err)
		}
		
		// Check application was deleted
		_, exists := mockAppRepo.Applications[appID]
		if exists {
			t.Error("Expected application to be deleted")
		}
		
		// Check all toggles were deleted
		if len(mockToggleRepo.Toggles) != 0 {
			t.Errorf("Expected all toggles to be deleted, but %d toggles remain", len(mockToggleRepo.Toggles))
		}
		
		// Check no toggles remain associated with the app
		togglesInApp, err := mockToggleRepo.GetByAppID(appID)
		if err != nil {
			t.Errorf("Error getting toggles by app: %v", err)
		}
		if len(togglesInApp) > 0 {
			t.Errorf("Expected no toggles associated with app, but found %d", len(togglesInApp))
		}
	})
}

func TestApplicationUseCase_DeleteApplication_CascadeErrorHandling(t *testing.T) {
	mockAppRepo := NewMockApplicationRepository()
	mockToggleRepo := NewMockToggleRepository()
	
	appID := "test-app-456"
	app := &entity.Application{ID: appID, Name: "Test App"}
	mockAppRepo.Applications[appID] = app
	
	// Create toggle that will cause error on deletion
	toggle1 := &entity.Toggle{ID: "toggle1", Path: "feature.test", AppID: appID}
	mockToggleRepo.Toggles["toggle1"] = toggle1
	// Toggle is associated through AppID field
	
	useCase := NewApplicationUseCase(mockAppRepo, mockToggleRepo)
	
	t.Run("should handle toggle deletion error", func(t *testing.T) {
		// Setup error for toggle deletion
		mockToggleRepo.DeleteError = entity.NewAppError(entity.ErrCodeDatabase, "toggle deletion failed")
		
		// Execute
		err := useCase.DeleteApplication(appID)
		
		// Verify error is returned
		if err == nil {
			t.Error("Expected error when toggle deletion fails")
		}
		
		appErr, ok := err.(*entity.AppError)
		if !ok {
			t.Errorf("Expected AppError, got %T", err)
		}
		
		if appErr.Code != entity.ErrCodeDatabase {
			t.Errorf("Expected ErrCodeDatabase, got %s", appErr.Code)
		}
		
		// Application should still exist since toggle deletion failed
		_, exists := mockAppRepo.Applications[appID]
		if !exists {
			t.Error("Expected application to still exist when toggle deletion fails")
		}
	})
}

func TestApplicationUseCase_DeleteApplication_NoToggles(t *testing.T) {
	mockAppRepo := NewMockApplicationRepository()
	mockToggleRepo := NewMockToggleRepository()
	
	appID := "test-app-789"
	app := &entity.Application{ID: appID, Name: "Test App"}
	mockAppRepo.Applications[appID] = app
	
	useCase := NewApplicationUseCase(mockAppRepo, mockToggleRepo)
	
	t.Run("should delete application with no toggles", func(t *testing.T) {
		// Execute
		err := useCase.DeleteApplication(appID)
		
		// Verify
		if err != nil {
			t.Errorf("Expected no error, got %v", err)
		}
		
		// Check application was deleted
		_, exists := mockAppRepo.Applications[appID]
		if exists {
			t.Error("Expected application to be deleted")
		}
	})
}