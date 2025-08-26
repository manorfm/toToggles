package entity

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestNewApprovalRequest(t *testing.T) {
	t.Run("should create approval request successfully", func(t *testing.T) {
		actionType := ApprovalActionToggleCreate
		description := "Create new toggle for feature X"
		requestedBy := "user-123"
		teamID := "team-456"
		applicationID := "app-789"
		toggleID := "toggle-101"
		actionData := map[string]interface{}{
			"toggle_name": "feature.new.button",
			"enabled":     true,
		}

		request, err := NewApprovalRequest(
			actionType,
			description,
			requestedBy,
			teamID,
			&applicationID,
			&toggleID,
			actionData,
		)

		assert.NoError(t, err)
		assert.NotNil(t, request)
		assert.NotEmpty(t, request.ID)
		assert.Equal(t, actionType, request.ActionType)
		assert.Equal(t, description, request.Description)
		assert.Equal(t, requestedBy, request.RequestedBy)
		assert.Equal(t, teamID, request.TeamID)
		assert.Equal(t, &applicationID, request.ApplicationID)
		assert.Equal(t, &toggleID, request.ToggleID)
		assert.Equal(t, ApprovalStatusPending, request.Status)
		assert.NotNil(t, request.ActionData)
		assert.True(t, request.ExpiresAt.After(time.Now()))
	})

	t.Run("should handle nil pointers correctly", func(t *testing.T) {
		request, err := NewApprovalRequest(
			ApprovalActionApplicationCreate,
			"Create new application",
			"user-123",
			"team-456",
			nil,
			nil,
			nil,
		)

		assert.NoError(t, err)
		assert.NotNil(t, request)
		assert.Nil(t, request.ApplicationID)
		assert.Nil(t, request.ToggleID)
	})
}

func TestApprovalRequest_Approve(t *testing.T) {
	request := &ApprovalRequest{
		ID:        "req-123",
		Status:    ApprovalStatusPending,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}

	t.Run("should approve pending request", func(t *testing.T) {
		approverID := "approver-456"
		err := request.Approve(approverID)

		assert.NoError(t, err)
		assert.Equal(t, ApprovalStatusApproved, request.Status)
		assert.Equal(t, &approverID, request.ActionedBy)
		assert.NotNil(t, request.ActionedAt)
		assert.True(t, request.ActionedAt.Before(time.Now().Add(time.Second)))
	})

	t.Run("should fail to approve non-pending request", func(t *testing.T) {
		request.Status = ApprovalStatusApproved
		err := request.Approve("another-user")

		assert.Error(t, err)
		assert.Contains(t, err.Error(), "not pending")
	})

	t.Run("should fail to approve expired request", func(t *testing.T) {
		expiredRequest := &ApprovalRequest{
			Status:    ApprovalStatusPending,
			ExpiresAt: time.Now().Add(-1 * time.Hour),
		}

		err := expiredRequest.Approve("user-123")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "expired")
	})
}

func TestApprovalRequest_Reject(t *testing.T) {
	request := &ApprovalRequest{
		ID:        "req-123",
		Status:    ApprovalStatusPending,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}

	t.Run("should reject pending request", func(t *testing.T) {
		rejectorID := "rejector-456"
		reason := "Invalid toggle configuration"
		err := request.Reject(rejectorID, reason)

		assert.NoError(t, err)
		assert.Equal(t, ApprovalStatusRejected, request.Status)
		assert.Equal(t, &rejectorID, request.ActionedBy)
		assert.Equal(t, &reason, request.RejectionReason)
		assert.NotNil(t, request.ActionedAt)
		assert.True(t, request.ActionedAt.Before(time.Now().Add(time.Second)))
	})

	t.Run("should reject with empty reason", func(t *testing.T) {
		pendingRequest := &ApprovalRequest{
			Status:    ApprovalStatusPending,
			ExpiresAt: time.Now().Add(24 * time.Hour),
		}

		rejectorID := "rejector-456"
		err := pendingRequest.Reject(rejectorID, "")

		assert.NoError(t, err)
		assert.Equal(t, ApprovalStatusRejected, pendingRequest.Status)
		assert.Nil(t, pendingRequest.RejectionReason)
	})

	t.Run("should fail to reject non-pending request", func(t *testing.T) {
		request.Status = ApprovalStatusRejected
		err := request.Reject("another-user", "reason")

		assert.Error(t, err)
		assert.Contains(t, err.Error(), "not pending")
	})
}

func TestApprovalRequest_IsExpired(t *testing.T) {
	t.Run("should return true for expired request", func(t *testing.T) {
		request := &ApprovalRequest{
			ExpiresAt: time.Now().Add(-1 * time.Hour),
		}

		assert.True(t, request.IsExpired())
	})

	t.Run("should return false for non-expired request", func(t *testing.T) {
		request := &ApprovalRequest{
			ExpiresAt: time.Now().Add(1 * time.Hour),
		}

		assert.False(t, request.IsExpired())
	})
}

func TestApprovalRequest_MarkAsExpired(t *testing.T) {
	t.Run("should mark expired pending request as expired", func(t *testing.T) {
		request := &ApprovalRequest{
			Status:    ApprovalStatusPending,
			ExpiresAt: time.Now().Add(-1 * time.Hour),
		}

		request.MarkAsExpired()
		assert.Equal(t, ApprovalStatusExpired, request.Status)
	})

	t.Run("should not mark non-expired request as expired", func(t *testing.T) {
		request := &ApprovalRequest{
			Status:    ApprovalStatusPending,
			ExpiresAt: time.Now().Add(1 * time.Hour),
		}

		request.MarkAsExpired()
		assert.Equal(t, ApprovalStatusPending, request.Status)
	})

	t.Run("should not mark non-pending request as expired", func(t *testing.T) {
		request := &ApprovalRequest{
			Status:    ApprovalStatusApproved,
			ExpiresAt: time.Now().Add(-1 * time.Hour),
		}

		request.MarkAsExpired()
		assert.Equal(t, ApprovalStatusApproved, request.Status)
	})
}

func TestApprovalRequest_CanBeApprovedBy(t *testing.T) {
	userID := "user-123"
	approverID := "approver-456"

	t.Run("should allow approval by different user", func(t *testing.T) {
		request := &ApprovalRequest{
			RequestedBy: userID,
			Status:      ApprovalStatusPending,
			ExpiresAt:   time.Now().Add(1 * time.Hour),
		}

		assert.True(t, request.CanBeApprovedBy(approverID))
	})

	t.Run("should not allow self-approval", func(t *testing.T) {
		request := &ApprovalRequest{
			RequestedBy: userID,
			Status:      ApprovalStatusPending,
			ExpiresAt:   time.Now().Add(1 * time.Hour),
		}

		assert.False(t, request.CanBeApprovedBy(userID))
	})

	t.Run("should not allow approval of non-pending request", func(t *testing.T) {
		request := &ApprovalRequest{
			RequestedBy: userID,
			Status:      ApprovalStatusApproved,
			ExpiresAt:   time.Now().Add(1 * time.Hour),
		}

		assert.False(t, request.CanBeApprovedBy(approverID))
	})

	t.Run("should not allow approval of expired request", func(t *testing.T) {
		request := &ApprovalRequest{
			RequestedBy: userID,
			Status:      ApprovalStatusPending,
			ExpiresAt:   time.Now().Add(-1 * time.Hour),
		}

		assert.False(t, request.CanBeApprovedBy(approverID))
	})
}

func TestApprovalRequest_GetActionDataAs(t *testing.T) {
	t.Run("should deserialize action data correctly", func(t *testing.T) {
		actionData := map[string]interface{}{
			"toggle_name": "feature.test",
			"enabled":     true,
		}

		request, err := NewApprovalRequest(
			ApprovalActionToggleCreate,
			"test",
			"user-123",
			"team-456",
			nil,
			nil,
			actionData,
		)
		assert.NoError(t, err)

		var result map[string]interface{}
		err = request.GetActionDataAs(&result)

		assert.NoError(t, err)
		assert.Equal(t, "feature.test", result["toggle_name"])
		assert.Equal(t, true, result["enabled"])
	})
}

func TestApprovalRequest_Validate(t *testing.T) {
	t.Run("should validate valid request", func(t *testing.T) {
		appID := "app-123"
		request := &ApprovalRequest{
			ActionType:    ApprovalActionToggleCreate,
			RequestedBy:   "user-123",
			TeamID:        "team-456",
			ApplicationID: &appID, // Toggle actions precisam de application_id
		}

		err := request.Validate()
		assert.NoError(t, err)
	})

	t.Run("should fail validation for missing requested_by", func(t *testing.T) {
		request := &ApprovalRequest{
			ActionType: ApprovalActionToggleCreate,
			TeamID:     "team-456",
		}

		err := request.Validate()
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "requested_by is required")
	})

	t.Run("should fail validation for missing team_id", func(t *testing.T) {
		request := &ApprovalRequest{
			ActionType:  ApprovalActionToggleCreate,
			RequestedBy: "user-123",
		}

		err := request.Validate()
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "team_id is required")
	})

	t.Run("should fail validation for invalid action_type", func(t *testing.T) {
		request := &ApprovalRequest{
			ActionType:  ApprovalActionType("invalid_action"),
			RequestedBy: "user-123",
			TeamID:      "team-456",
		}

		err := request.Validate()
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "invalid action_type")
	})

	t.Run("should fail validation for toggle action without application_id", func(t *testing.T) {
		request := &ApprovalRequest{
			ActionType:  ApprovalActionToggleCreate,
			RequestedBy: "user-123",
			TeamID:      "team-456",
		}

		err := request.Validate()
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "application_id is required for toggle actions")
	})
}

func TestGetActionTypeDisplayName(t *testing.T) {
	tests := []struct {
		actionType   ApprovalActionType
		expectedName string
	}{
		{ApprovalActionToggleCreate, "Criar Toggle"},
		{ApprovalActionToggleUpdate, "Atualizar Toggle"},
		{ApprovalActionToggleDelete, "Excluir Toggle"},
		{ApprovalActionApplicationCreate, "Criar Aplicação"},
		{ApprovalActionType("unknown"), "unknown"},
	}

	for _, test := range tests {
		t.Run(string(test.actionType), func(t *testing.T) {
			result := GetActionTypeDisplayName(test.actionType)
			assert.Equal(t, test.expectedName, result)
		})
	}
}

func TestGetStatusDisplayName(t *testing.T) {
	tests := []struct {
		status       ApprovalStatus
		expectedName string
	}{
		{ApprovalStatusPending, "Pendente"},
		{ApprovalStatusApproved, "Aprovado"},
		{ApprovalStatusRejected, "Rejeitado"},
		{ApprovalStatusExpired, "Expirado"},
		{ApprovalStatus("unknown"), "unknown"},
	}

	for _, test := range tests {
		t.Run(string(test.status), func(t *testing.T) {
			result := GetStatusDisplayName(test.status)
			assert.Equal(t, test.expectedName, result)
		})
	}
}