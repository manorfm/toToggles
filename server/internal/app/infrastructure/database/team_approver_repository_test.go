package database

import (
	"context"
	"testing"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupTeamApproverTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	// Auto migrate all related tables
	err = db.AutoMigrate(
		&entity.User{},
		&entity.Team{},
		&entity.TeamUser{},
	)
	require.NoError(t, err)

	return db
}

func createTestDataForTeamApprover(t *testing.T, db *gorm.DB) (string, string, string) {
	// Create test users
	user1 := &entity.User{
		ID:       "user-123",
		Username: "testuser1",
		Role:     entity.UserRoleAdmin,
	}
	require.NoError(t, db.Create(user1).Error)

	user2 := &entity.User{
		ID:       "user-456",
		Username: "testuser2",
		Role:     entity.UserRoleAdmin,
	}
	require.NoError(t, db.Create(user2).Error)

	// Create a test team
	team := &entity.Team{
		ID:   "team-789",
		Name: "Test Team",
	}
	require.NoError(t, db.Create(team).Error)

	// Add users to team
	teamUser1 := &entity.TeamUser{
		TeamID:     team.ID,
		UserID:     user1.ID,
		IsApprover: false,
	}
	require.NoError(t, db.Create(teamUser1).Error)

	teamUser2 := &entity.TeamUser{
		TeamID:     team.ID,
		UserID:     user2.ID,
		IsApprover: false,
	}
	require.NoError(t, db.Create(teamUser2).Error)

	return user1.ID, user2.ID, team.ID
}

func TestTeamApproverRepository_SetUserAsApprover(t *testing.T) {
	db := setupTeamApproverTestDB(t)
	user1ID, user2ID, teamID := createTestDataForTeamApprover(t, db)
	repo := NewTeamApproverRepository(db)

	t.Run("should set user as approver successfully", func(t *testing.T) {
		err := repo.SetUserAsApprover(context.Background(), teamID, user1ID, true)
		assert.NoError(t, err)

		// Verify the user is now an approver
		var teamUser entity.TeamUser
		err = db.Where("team_id = ? AND user_id = ?", teamID, user1ID).First(&teamUser).Error
		require.NoError(t, err)
		assert.True(t, teamUser.IsApprover)
	})

	t.Run("should remove approver status successfully", func(t *testing.T) {
		// First set as approver
		err := repo.SetUserAsApprover(context.Background(), teamID, user2ID, true)
		require.NoError(t, err)

		// Then remove approver status
		err = repo.SetUserAsApprover(context.Background(), teamID, user2ID, false)
		assert.NoError(t, err)

		// Verify the user is no longer an approver
		var teamUser entity.TeamUser
		err = db.Where("team_id = ? AND user_id = ?", teamID, user2ID).First(&teamUser).Error
		require.NoError(t, err)
		assert.False(t, teamUser.IsApprover)
	})

	t.Run("should fail for non-existent team-user relationship", func(t *testing.T) {
		err := repo.SetUserAsApprover(context.Background(), "non-existent-team", user1ID, true)
		assert.Error(t, err)

		err = repo.SetUserAsApprover(context.Background(), teamID, "non-existent-user", true)
		assert.Error(t, err)
	})
}

func TestTeamApproverRepository_IsUserApprover(t *testing.T) {
	db := setupTeamApproverTestDB(t)
	user1ID, user2ID, teamID := createTestDataForTeamApprover(t, db)
	repo := NewTeamApproverRepository(db)

	// Set user1 as approver
	err := repo.SetUserAsApprover(context.Background(), teamID, user1ID, true)
	require.NoError(t, err)

	t.Run("should return true for approver", func(t *testing.T) {
		isApprover, err := repo.IsUserApprover(context.Background(), teamID, user1ID)
		assert.NoError(t, err)
		assert.True(t, isApprover)
	})

	t.Run("should return false for non-approver", func(t *testing.T) {
		isApprover, err := repo.IsUserApprover(context.Background(), teamID, user2ID)
		assert.NoError(t, err)
		assert.False(t, isApprover)
	})

	t.Run("should return false for non-existent relationships", func(t *testing.T) {
		isApprover, err := repo.IsUserApprover(context.Background(), "non-existent-team", user1ID)
		assert.NoError(t, err)
		assert.False(t, isApprover)

		isApprover, err = repo.IsUserApprover(context.Background(), teamID, "non-existent-user")
		assert.NoError(t, err)
		assert.False(t, isApprover)
	})
}

func TestTeamApproverRepository_GetTeamApprovers(t *testing.T) {
	db := setupTeamApproverTestDB(t)
	user1ID, user2ID, teamID := createTestDataForTeamApprover(t, db)
	repo := NewTeamApproverRepository(db)

	// Set both users as approvers
	err := repo.SetUserAsApprover(context.Background(), teamID, user1ID, true)
	require.NoError(t, err)
	err = repo.SetUserAsApprover(context.Background(), teamID, user2ID, true)
	require.NoError(t, err)

	t.Run("should get all team approvers", func(t *testing.T) {
		approvers, err := repo.GetTeamApprovers(context.Background(), teamID)
		assert.NoError(t, err)
		assert.Len(t, approvers, 2)

		// Verify approvers have correct data
		userIDs := make([]string, len(approvers))
		for i, approver := range approvers {
			userIDs[i] = approver.UserID
			assert.NotEmpty(t, approver.Username)
			assert.NotEmpty(t, approver.Role)
			assert.True(t, approver.IsApprover)
		}

		assert.Contains(t, userIDs, user1ID)
		assert.Contains(t, userIDs, user2ID)
	})

	t.Run("should return empty list for team with no approvers", func(t *testing.T) {
		// Create another team
		newTeam := &entity.Team{
			ID:   "team-new",
			Name: "New Team",
		}
		require.NoError(t, db.Create(newTeam).Error)

		approvers, err := repo.GetTeamApprovers(context.Background(), newTeam.ID)
		assert.NoError(t, err)
		assert.Len(t, approvers, 0)
	})

	t.Run("should return empty list for non-existent team", func(t *testing.T) {
		approvers, err := repo.GetTeamApprovers(context.Background(), "non-existent-team")
		assert.NoError(t, err)
		assert.Len(t, approvers, 0)
	})
}

func TestTeamApproverRepository_GetUserTeamsAsApprover(t *testing.T) {
	db := setupTeamApproverTestDB(t)
	user1ID, user2ID, teamID := createTestDataForTeamApprover(t, db)
	repo := NewTeamApproverRepository(db)

	// Create another team
	team2 := &entity.Team{
		ID:   "team-second",
		Name: "Second Team",
	}
	require.NoError(t, db.Create(team2).Error)

	// Add user1 to second team as approver
	teamUser := &entity.TeamUser{
		TeamID:     team2.ID,
		UserID:     user1ID,
		IsApprover: true,
	}
	require.NoError(t, db.Create(teamUser).Error)

	// Set user1 as approver in first team
	err := repo.SetUserAsApprover(context.Background(), teamID, user1ID, true)
	require.NoError(t, err)

	t.Run("should get all teams where user is approver", func(t *testing.T) {
		teamIDs, err := repo.GetUserTeamsAsApprover(context.Background(), user1ID)
		assert.NoError(t, err)
		assert.Len(t, teamIDs, 2)
		assert.Contains(t, teamIDs, teamID)
		assert.Contains(t, teamIDs, team2.ID)
	})

	t.Run("should return empty list for user with no approver teams", func(t *testing.T) {
		teamIDs, err := repo.GetUserTeamsAsApprover(context.Background(), user2ID)
		assert.NoError(t, err)
		assert.Len(t, teamIDs, 0)
	})

	t.Run("should return empty list for non-existent user", func(t *testing.T) {
		teamIDs, err := repo.GetUserTeamsAsApprover(context.Background(), "non-existent-user")
		assert.NoError(t, err)
		assert.Len(t, teamIDs, 0)
	})
}

func TestTeamApproverRepository_GetApprovableTeamsByUser(t *testing.T) {
	db := setupTeamApproverTestDB(t)
	user1ID, user2ID, teamID := createTestDataForTeamApprover(t, db)
	repo := NewTeamApproverRepository(db)

	// Set user1 as approver
	err := repo.SetUserAsApprover(context.Background(), teamID, user1ID, true)
	require.NoError(t, err)

	t.Run("should get teams that user can approve for", func(t *testing.T) {
		teamIDs, err := repo.GetApprovableTeamsByUser(context.Background(), user1ID)
		assert.NoError(t, err)
		assert.GreaterOrEqual(t, len(teamIDs), 1)
		assert.Contains(t, teamIDs, teamID)
	})

	t.Run("should return empty list for non-approver", func(t *testing.T) {
		teamIDs, err := repo.GetApprovableTeamsByUser(context.Background(), user2ID)
		assert.NoError(t, err)
		assert.Len(t, teamIDs, 0)
	})

	t.Run("should return empty list for non-existent user", func(t *testing.T) {
		teamIDs, err := repo.GetApprovableTeamsByUser(context.Background(), "non-existent-user")
		assert.NoError(t, err)
		assert.Len(t, teamIDs, 0)
	})
}

func TestTeamApproverRepository_GetApproverCountByTeam(t *testing.T) {
	db := setupTeamApproverTestDB(t)
	user1ID, user2ID, teamID := createTestDataForTeamApprover(t, db)
	repo := NewTeamApproverRepository(db)

	t.Run("should return 0 for team with no approvers", func(t *testing.T) {
		count, err := repo.GetApproverCountByTeam(context.Background(), teamID)
		assert.NoError(t, err)
		assert.Equal(t, 0, count)
	})

	t.Run("should return correct count for team with approvers", func(t *testing.T) {
		// Set both users as approvers
		err := repo.SetUserAsApprover(context.Background(), teamID, user1ID, true)
		require.NoError(t, err)
		err = repo.SetUserAsApprover(context.Background(), teamID, user2ID, true)
		require.NoError(t, err)

		count, err := repo.GetApproverCountByTeam(context.Background(), teamID)
		assert.NoError(t, err)
		assert.Equal(t, 2, count)
	})

	t.Run("should return 0 for non-existent team", func(t *testing.T) {
		count, err := repo.GetApproverCountByTeam(context.Background(), "non-existent-team")
		assert.NoError(t, err)
		assert.Equal(t, 0, count)
	})
}

func TestTeamApproverRepository_Integration(t *testing.T) {
	t.Run("complete workflow integration test", func(t *testing.T) {
		// Setup isolated test environment
		db := setupTeamApproverTestDB(t)
		user1ID, user2ID, teamID := createTestDataForTeamApprover(t, db)
		repo := NewTeamApproverRepository(db)
		
		// 1. Initially no users should be approvers
		approvers, err := repo.GetTeamApprovers(context.Background(), teamID)
		assert.NoError(t, err)
		assert.Len(t, approvers, 0)

		// 2. Set user1 as approver
		err = repo.SetUserAsApprover(context.Background(), teamID, user1ID, true)
		assert.NoError(t, err)

		// 3. Verify user1 is approver
		isApprover, err := repo.IsUserApprover(context.Background(), teamID, user1ID)
		assert.NoError(t, err)
		assert.True(t, isApprover)

		// 4. Get team approvers
		approvers, err = repo.GetTeamApprovers(context.Background(), teamID)
		assert.NoError(t, err)
		assert.Len(t, approvers, 1)
		assert.Equal(t, user1ID, approvers[0].UserID)

		// 5. Get user approver teams
		teamIDs, err := repo.GetUserTeamsAsApprover(context.Background(), user1ID)
		assert.NoError(t, err)
		assert.Len(t, teamIDs, 1)
		assert.Equal(t, teamID, teamIDs[0])

		// 6. Get approvable teams
		approvableTeamIDs, err := repo.GetApprovableTeamsByUser(context.Background(), user1ID)
		assert.NoError(t, err)
		assert.GreaterOrEqual(t, len(approvableTeamIDs), 1)
		assert.Contains(t, approvableTeamIDs, teamID)

		// 7. Set user2 as approver
		err = repo.SetUserAsApprover(context.Background(), teamID, user2ID, true)
		assert.NoError(t, err)

		// 8. Verify both users are approvers
		approvers, err = repo.GetTeamApprovers(context.Background(), teamID)
		assert.NoError(t, err)
		assert.Len(t, approvers, 2)

		// 9. Get approver count
		count, err := repo.GetApproverCountByTeam(context.Background(), teamID)
		assert.NoError(t, err)
		assert.Equal(t, 2, count)

		// 10. Remove user1 approver status
		err = repo.SetUserAsApprover(context.Background(), teamID, user1ID, false)
		assert.NoError(t, err)

		// 11. Verify only user2 remains as approver
		approvers, err = repo.GetTeamApprovers(context.Background(), teamID)
		assert.NoError(t, err)
		assert.Len(t, approvers, 1)
		assert.Equal(t, user2ID, approvers[0].UserID)

		count, err = repo.GetApproverCountByTeam(context.Background(), teamID)
		assert.NoError(t, err)
		assert.Equal(t, 1, count)
	})
}