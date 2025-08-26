package database

import (
	"context"
	"testing"
	"time"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupApprovalRequestTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	// Auto migrate all related tables
	err = db.AutoMigrate(
		&entity.User{},
		&entity.Team{},
		&entity.TeamUser{},
		&entity.Application{},
		&entity.ApprovalRequest{},
	)
	require.NoError(t, err)

	return db
}

func createTestDataForApprovalRequest(t *testing.T, db *gorm.DB) (string, string, string) {
	// Create a test user
	user := &entity.User{
		ID:       "user-123",
		Username: "testuser",
		Role:     entity.UserRoleAdmin,
	}
	require.NoError(t, db.Create(user).Error)

	// Create a test team
	team := &entity.Team{
		ID:   "team-456",
		Name: "Test Team",
	}
	require.NoError(t, db.Create(team).Error)

	// Create a test application
	app := &entity.Application{
		ID:   "app-789",
		Name: "Test App",
	}
	require.NoError(t, db.Create(app).Error)

	return user.ID, team.ID, app.ID
}

func TestApprovalRequestRepository_Create(t *testing.T) {
	db := setupApprovalRequestTestDB(t)
	userID, teamID, appID := createTestDataForApprovalRequest(t, db)
	repo := NewApprovalRequestRepository(db)

	t.Run("should create approval request successfully", func(t *testing.T) {
		toggleID := "toggle-101"
		request, err := entity.NewApprovalRequest(
			entity.ApprovalActionToggleCreate,
			"Create new toggle",
			userID,
			teamID,
			&appID,
			&toggleID,
			map[string]interface{}{"name": "test.toggle"},
		)
		require.NoError(t, err)

		err = repo.Create(context.Background(), request)
		assert.NoError(t, err)
		assert.NotEmpty(t, request.ID)
	})

	t.Run("should handle nil pointers correctly", func(t *testing.T) {
		request, err := entity.NewApprovalRequest(
			entity.ApprovalActionApplicationCreate,
			"Create new application",
			userID,
			teamID,
			nil,
			nil,
			nil,
		)
		require.NoError(t, err)

		err = repo.Create(context.Background(), request)
		assert.NoError(t, err)
	})
}

func TestApprovalRequestRepository_GetByID(t *testing.T) {
	db := setupApprovalRequestTestDB(t)
	userID, teamID, appID := createTestDataForApprovalRequest(t, db)
	repo := NewApprovalRequestRepository(db)

	// Create a test approval request
	toggleID := "toggle-101"
	request, err := entity.NewApprovalRequest(
		entity.ApprovalActionToggleCreate,
		"Create new toggle",
		userID,
		teamID,
		&appID,
		&toggleID,
		map[string]interface{}{"name": "test.toggle"},
	)
	require.NoError(t, err)
	require.NoError(t, repo.Create(context.Background(), request))

	t.Run("should get existing approval request", func(t *testing.T) {
		found, err := repo.GetByID(context.Background(), request.ID)
		assert.NoError(t, err)
		assert.NotNil(t, found)
		assert.Equal(t, request.ID, found.ID)
		assert.Equal(t, request.ActionType, found.ActionType)
		assert.Equal(t, request.Description, found.Description)
	})

	t.Run("should return nil for non-existent ID", func(t *testing.T) {
		found, err := repo.GetByID(context.Background(), "non-existent")
		assert.Error(t, err) // GORM returns error for not found
		assert.Nil(t, found)
	})
}

func TestApprovalRequestRepository_Update(t *testing.T) {
	db := setupApprovalRequestTestDB(t)
	userID, teamID, appID := createTestDataForApprovalRequest(t, db)
	repo := NewApprovalRequestRepository(db)

	// Create a test approval request
	toggleID := "toggle-101"
	request, err := entity.NewApprovalRequest(
		entity.ApprovalActionToggleCreate,
		"Create new toggle",
		userID,
		teamID,
		&appID,
		&toggleID,
		map[string]interface{}{"name": "test.toggle"},
	)
	require.NoError(t, err)
	require.NoError(t, repo.Create(context.Background(), request))

	t.Run("should update approval request", func(t *testing.T) {
		approverID := "approver-123"
		err := request.Approve(approverID)
		require.NoError(t, err)

		err = repo.Update(context.Background(), request)
		assert.NoError(t, err)

		// Verify update
		updated, err := repo.GetByID(context.Background(), request.ID)
		require.NoError(t, err)
		assert.Equal(t, entity.ApprovalStatusApproved, updated.Status)
		assert.Equal(t, &approverID, updated.ActionedBy)
		assert.NotNil(t, updated.ActionedAt)
	})
}

func TestApprovalRequestRepository_GetAllWithDetails(t *testing.T) {
	db := setupApprovalRequestTestDB(t)
	userID, teamID, appID := createTestDataForApprovalRequest(t, db)
	repo := NewApprovalRequestRepository(db)

	// Create multiple test approval requests
	requests := make([]*entity.ApprovalRequest, 3)
	for i := 0; i < 3; i++ {
		request, err := entity.NewApprovalRequest(
			entity.ApprovalActionToggleCreate,
			"Create toggle",
			userID,
			teamID,
			&appID,
			nil,
			nil,
		)
		require.NoError(t, err)
		require.NoError(t, repo.Create(context.Background(), request))
		requests[i] = request
	}

	t.Run("should get all approval requests with details", func(t *testing.T) {
		results, err := repo.GetAllWithDetails(context.Background())
		assert.NoError(t, err)
		assert.GreaterOrEqual(t, len(results), 3)

		// Verify details are populated
		for _, result := range results {
			assert.NotEmpty(t, result.ID)
			assert.NotEmpty(t, result.RequesterName)
			assert.NotEmpty(t, result.TeamName)
		}
	})
}

func TestApprovalRequestRepository_GetPendingWithDetails(t *testing.T) {
	db := setupApprovalRequestTestDB(t)
	userID, teamID, appID := createTestDataForApprovalRequest(t, db)
	repo := NewApprovalRequestRepository(db)

	// Create pending and approved requests
	pendingRequest, err := entity.NewApprovalRequest(
		entity.ApprovalActionToggleCreate,
		"Pending request",
		userID,
		teamID,
		&appID,
		nil,
		nil,
	)
	require.NoError(t, err)
	require.NoError(t, repo.Create(context.Background(), pendingRequest))

	approvedRequest, err := entity.NewApprovalRequest(
		entity.ApprovalActionToggleUpdate,
		"Approved request",
		userID,
		teamID,
		&appID,
		nil,
		nil,
	)
	require.NoError(t, err)
	require.NoError(t, repo.Create(context.Background(), approvedRequest))
	require.NoError(t, approvedRequest.Approve("approver-123"))
	require.NoError(t, repo.Update(context.Background(), approvedRequest))

	t.Run("should get only pending requests", func(t *testing.T) {
		results, err := repo.GetPendingWithDetails(context.Background())
		assert.NoError(t, err)
		assert.GreaterOrEqual(t, len(results), 1)

		// Verify all returned requests are pending
		for _, result := range results {
			assert.Equal(t, entity.ApprovalStatusPending, result.Status)
		}
	})
}

func TestApprovalRequestRepository_GetByTeamIDWithDetails(t *testing.T) {
	db := setupApprovalRequestTestDB(t)
	userID, teamID, appID := createTestDataForApprovalRequest(t, db)
	repo := NewApprovalRequestRepository(db)

	// Create another team
	otherTeam := &entity.Team{
		ID:   "team-other",
		Name: "Other Team",
	}
	require.NoError(t, db.Create(otherTeam).Error)

	// Create requests for different teams
	teamRequest, err := entity.NewApprovalRequest(
		entity.ApprovalActionToggleCreate,
		"Team request",
		userID,
		teamID,
		&appID,
		nil,
		nil,
	)
	require.NoError(t, err)
	require.NoError(t, repo.Create(context.Background(), teamRequest))

	otherTeamRequest, err := entity.NewApprovalRequest(
		entity.ApprovalActionToggleCreate,
		"Other team request",
		userID,
		otherTeam.ID,
		&appID,
		nil,
		nil,
	)
	require.NoError(t, err)
	require.NoError(t, repo.Create(context.Background(), otherTeamRequest))

	t.Run("should get requests for specific team", func(t *testing.T) {
		results, err := repo.GetPendingByTeamIDWithDetails(context.Background(), teamID)
		assert.NoError(t, err)
		assert.GreaterOrEqual(t, len(results), 1)

		// Verify all returned requests belong to the team
		for _, result := range results {
			assert.Equal(t, teamID, result.TeamID)
		}
	})
}

func TestApprovalRequestRepository_GetByRequesterID(t *testing.T) {
	db := setupApprovalRequestTestDB(t)
	userID, teamID, appID := createTestDataForApprovalRequest(t, db)
	repo := NewApprovalRequestRepository(db)

	// Create another user
	otherUser := &entity.User{
		ID:       "user-other",
		Username: "otheruser",
		Role:     entity.UserRoleAdmin,
	}
	require.NoError(t, db.Create(otherUser).Error)

	// Create requests by different users
	userRequest, err := entity.NewApprovalRequest(
		entity.ApprovalActionToggleCreate,
		"User request",
		userID,
		teamID,
		&appID,
		nil,
		nil,
	)
	require.NoError(t, err)
	require.NoError(t, repo.Create(context.Background(), userRequest))

	otherUserRequest, err := entity.NewApprovalRequest(
		entity.ApprovalActionToggleCreate,
		"Other user request",
		otherUser.ID,
		teamID,
		&appID,
		nil,
		nil,
	)
	require.NoError(t, err)
	require.NoError(t, repo.Create(context.Background(), otherUserRequest))

	t.Run("should get requests for specific user", func(t *testing.T) {
		results, err := repo.GetByRequesterID(context.Background(), userID)
		assert.NoError(t, err)
		assert.GreaterOrEqual(t, len(results), 1)

		// Verify all returned requests belong to the user
		for _, result := range results {
			assert.Equal(t, userID, result.RequestedBy)
		}
	})
}

func TestApprovalRequestRepository_GetApprovableByUserID(t *testing.T) {
	db := setupApprovalRequestTestDB(t)
	userID, teamID, appID := createTestDataForApprovalRequest(t, db)
	repo := NewApprovalRequestRepository(db)

	// Create an approver user
	approverUser := &entity.User{
		ID:       "approver-456",
		Username: "approver",
		Role:     entity.UserRoleAdmin,
	}
	require.NoError(t, db.Create(approverUser).Error)

	// Add approver to team as approver
	teamUser := &entity.TeamUser{
		TeamID:     teamID,
		UserID:     approverUser.ID,
		IsApprover: true,
	}
	require.NoError(t, db.Create(teamUser).Error)

	// Create approval request
	request, err := entity.NewApprovalRequest(
		entity.ApprovalActionToggleCreate,
		"Approvable request",
		userID,
		teamID,
		&appID,
		nil,
		nil,
	)
	require.NoError(t, err)
	require.NoError(t, repo.Create(context.Background(), request))

	t.Run("should get approvable requests for approver", func(t *testing.T) {
		results, err := repo.GetApprovableByUserID(context.Background(), approverUser.ID)
		assert.NoError(t, err)
		assert.GreaterOrEqual(t, len(results), 1)

		// Verify requests are pending and not self-requests
		for _, result := range results {
			assert.Equal(t, entity.ApprovalStatusPending, result.Status)
			assert.NotEqual(t, approverUser.ID, result.RequestedBy)
		}
	})

	t.Run("should not return requests for non-approver", func(t *testing.T) {
		results, err := repo.GetApprovableByUserID(context.Background(), userID)
		assert.NoError(t, err)
		// Should be empty or not contain requests from same user
		for _, result := range results {
			assert.NotEqual(t, userID, result.RequestedBy)
		}
	})
}

func TestApprovalRequestRepository_MarkExpiredRequests(t *testing.T) {
	db := setupApprovalRequestTestDB(t)
	userID, teamID, appID := createTestDataForApprovalRequest(t, db)
	repo := NewApprovalRequestRepository(db)

	// Create an expired request by manually setting expired time
	expiredRequest, err := entity.NewApprovalRequest(
		entity.ApprovalActionToggleCreate,
		"Expired request",
		userID,
		teamID,
		&appID,
		nil,
		nil,
	)
	require.NoError(t, err)
	expiredRequest.ExpiresAt = time.Now().Add(-1 * time.Hour) // Set to past
	require.NoError(t, repo.Create(context.Background(), expiredRequest))

	// Create a non-expired request
	validRequest, err := entity.NewApprovalRequest(
		entity.ApprovalActionToggleCreate,
		"Valid request",
		userID,
		teamID,
		&appID,
		nil,
		nil,
	)
	require.NoError(t, err)
	require.NoError(t, repo.Create(context.Background(), validRequest))

	t.Run("should mark expired pending requests", func(t *testing.T) {
		err := repo.MarkExpiredRequests(context.Background())
		assert.NoError(t, err)

		// Verify the expired request is marked as expired
		updated, err := repo.GetByID(context.Background(), expiredRequest.ID)
		require.NoError(t, err)
		assert.Equal(t, entity.ApprovalStatusExpired, updated.Status)

		// Verify the valid request is still pending
		valid, err := repo.GetByID(context.Background(), validRequest.ID)
		require.NoError(t, err)
		assert.Equal(t, entity.ApprovalStatusPending, valid.Status)
	})
}

func TestApprovalRequestRepository_GetRequestStatsByTeam(t *testing.T) {
	db := setupApprovalRequestTestDB(t)
	userID, teamID, appID := createTestDataForApprovalRequest(t, db)
	repo := NewApprovalRequestRepository(db)

	// Create requests with different statuses
	statuses := []entity.ApprovalStatus{
		entity.ApprovalStatusPending,
		entity.ApprovalStatusApproved,
		entity.ApprovalStatusRejected,
	}

	for _, status := range statuses {
		request, err := entity.NewApprovalRequest(
			entity.ApprovalActionToggleCreate,
			"Test request",
			userID,
			teamID,
			&appID,
			nil,
			nil,
		)
		require.NoError(t, err)

		if status == entity.ApprovalStatusApproved {
			request.Approve("approver-123")
		} else if status == entity.ApprovalStatusRejected {
			request.Reject("rejector-123", "Rejected")
		}

		require.NoError(t, repo.Create(context.Background(), request))
		if status != entity.ApprovalStatusPending {
			require.NoError(t, repo.Update(context.Background(), request))
		}
	}

	t.Run("should get stats for team", func(t *testing.T) {
		stats, err := repo.GetRequestStatsByTeam(context.Background(), teamID)
		assert.NoError(t, err)
		assert.NotNil(t, stats)
		assert.GreaterOrEqual(t, stats[entity.ApprovalStatusPending], 1)
		assert.GreaterOrEqual(t, stats[entity.ApprovalStatusApproved], 1)
		assert.GreaterOrEqual(t, stats[entity.ApprovalStatusRejected], 1)
	})
}

func TestApprovalRequestRepository_GetRequestStats(t *testing.T) {
	db := setupApprovalRequestTestDB(t)
	userID, teamID, appID := createTestDataForApprovalRequest(t, db)
	repo := NewApprovalRequestRepository(db)

	// Create some requests for global stats
	for i := 0; i < 2; i++ {
		request, err := entity.NewApprovalRequest(
			entity.ApprovalActionToggleCreate,
			"Global stats request",
			userID,
			teamID,
			&appID,
			nil,
			nil,
		)
		require.NoError(t, err)
		require.NoError(t, repo.Create(context.Background(), request))
	}

	t.Run("should get global stats", func(t *testing.T) {
		stats, err := repo.GetRequestStats(context.Background())
		assert.NoError(t, err)
		assert.NotNil(t, stats)
		assert.GreaterOrEqual(t, stats[entity.ApprovalStatusPending], 2)
	})
}