package usecase

import (
	"context"
	"testing"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
)

// Test focused on the specific changes made: ApplicationUseCase integration in ApprovalUseCase
func TestApprovalUseCase_ExecuteApplicationDeleteAction_Integration(t *testing.T) {
	t.Run("should test applicationUseCase integration in approval execution", func(t *testing.T) {
		// Setup
		mockAppRepo := NewMockApplicationRepository()
		mockToggleRepo := NewMockToggleRepository()
		mockUserRepo := NewMockUserRepository()
		mockTeamRepo := NewMockTeamRepository()
		
		// Create test application and toggles
		appID := "test-app-123"
		app := &entity.Application{ID: appID, Name: "Test App"}
		mockAppRepo.Applications[appID] = app
		
		toggle1 := &entity.Toggle{ID: "toggle1", Path: "feature", AppID: appID}
		toggle2 := &entity.Toggle{ID: "toggle2", Path: "feature.sub", AppID: appID}
		mockToggleRepo.Toggles["toggle1"] = toggle1
		mockToggleRepo.Toggles["toggle2"] = toggle2
		
		// Create use cases
		teamUseCase := NewTeamUseCase(mockTeamRepo, mockUserRepo, mockAppRepo)
		toggleUseCase := NewToggleUseCase(mockToggleRepo, mockAppRepo)
		applicationUseCase := NewApplicationUseCase(mockAppRepo, mockToggleRepo)
		
		// Create a minimal ApprovalUseCase using only required dependencies
		approvalUseCase := &ApprovalUseCase{
			applicationRepo:    mockAppRepo,
			toggleRepo:         mockToggleRepo,
			userRepo:           mockUserRepo,
			teamRepo:           mockTeamRepo,
			teamUseCase:        teamUseCase,
			toggleUseCase:      toggleUseCase,
			applicationUseCase: applicationUseCase,
		}
		
		// Create approval request for application deletion
		request := &entity.ApprovalRequest{
			ID:            "request-123",
			ActionType:    entity.ApprovalActionApplicationDelete,
			Description:   "Delete Test App",
			RequestedBy:   "user-123",
			TeamID:        "team-123",
			ApplicationID: &appID,
			Status:        entity.ApprovalStatusApproved,
		}
		
		ctx := context.Background()
		
		// Execute the specific method that was modified
		err := approvalUseCase.executeApplicationDeleteAction(ctx, request)
		
		// Verify
		if err != nil {
			t.Errorf("Expected no error, got %v", err)
		}
		
		// Check application was deleted
		_, exists := mockAppRepo.Applications[appID]
		if exists {
			t.Error("Expected application to be deleted through approval")
		}
		
		// Check toggles were deleted (cascade)
		if len(mockToggleRepo.Toggles) != 0 {
			t.Errorf("Expected all toggles to be deleted in cascade, but %d remain", len(mockToggleRepo.Toggles))
		}
		
		// Verify toggles are no longer associated with the app
		togglesInApp, err := mockToggleRepo.GetByAppID(appID)
		if err != nil {
			t.Errorf("Error getting toggles by app: %v", err)
		}
		if len(togglesInApp) > 0 {
			t.Errorf("Expected no toggles associated with deleted app, but found %d", len(togglesInApp))
		}
	})
	
	t.Run("should return error if application ID is missing", func(t *testing.T) {
		// Setup minimal ApprovalUseCase
		approvalUseCase := &ApprovalUseCase{
			applicationUseCase: NewApplicationUseCase(NewMockApplicationRepository(), NewMockToggleRepository()),
		}
		
		// Create approval request without application ID
		request := &entity.ApprovalRequest{
			ID:            "request-456",
			ActionType:    entity.ApprovalActionApplicationDelete,
			ApplicationID: nil, // Missing application ID
		}
		
		ctx := context.Background()
		
		// Execute
		err := approvalUseCase.executeApplicationDeleteAction(ctx, request)
		
		// Verify error
		if err == nil {
			t.Error("Expected error when application ID is missing")
		}
		
		if err.Error() != "application ID is required for application deletion" {
			t.Errorf("Expected specific error message, got: %s", err.Error())
		}
	})
}

func TestApprovalUseCase_NewConstructorWithApplicationUseCase(t *testing.T) {
	t.Run("should create ApprovalUseCase with ApplicationUseCase dependency", func(t *testing.T) {
		// Setup all dependencies
		mockAppRepo := NewMockApplicationRepository()
		mockToggleRepo := NewMockToggleRepository()
		mockUserRepo := NewMockUserRepository()
		mockTeamRepo := NewMockTeamRepository()
		
		teamUseCase := NewTeamUseCase(mockTeamRepo, mockUserRepo, mockAppRepo)
		toggleUseCase := NewToggleUseCase(mockToggleRepo, mockAppRepo)
		applicationUseCase := NewApplicationUseCase(mockAppRepo, mockToggleRepo)
		
		// This tests the new constructor signature with ApplicationUseCase and SecretKeyUseCase
		// We use nil for missing approval-specific repositories since we're only testing the constructor
		approvalUseCase := NewApprovalUseCase(
			nil, // approvalRequestRepo - not relevant for this test
			nil, // approvalSettingsRepo - not relevant for this test  
			nil, // teamApproverRepo - not relevant for this test
			mockUserRepo,
			mockTeamRepo,
			mockAppRepo,
			mockToggleRepo,
			teamUseCase,
			toggleUseCase,
			applicationUseCase, // This is the new parameter we added
			nil, // secretKeyUseCase - not relevant for this test
		)
		
		// Verify
		if approvalUseCase == nil {
			t.Error("Expected ApprovalUseCase to be created")
		}
		
		if approvalUseCase.applicationUseCase != applicationUseCase {
			t.Error("Expected ApplicationUseCase to be set correctly")
		}
		
		if approvalUseCase.teamUseCase != teamUseCase {
			t.Error("Expected TeamUseCase to be set correctly")
		}
		
		if approvalUseCase.toggleUseCase != toggleUseCase {
			t.Error("Expected ToggleUseCase to be set correctly")
		}
	})
}