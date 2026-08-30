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

	// Set only user1 as approver — user2 stays a plain (non-approver) member.
	err := repo.SetUserAsApprover(context.Background(), teamID, user1ID, true)
	require.NoError(t, err)

	// Bug real encontrado ao vivo (docs/rest-flow.md §9.3: "GET /teams/:id/approvers... Same
	// shape as above, for every member of the team (not just current approvers)"): a query SQL
	// tinha um "AND tu.is_approver = true" que fazia GetTeamApprovers devolver só os aprovadores
	// atuais, então GET /teams/:id/approvers silenciosamente omitia todo membro não-aprovador —
	// confirmado ao vivo contra o servidor real (um time com um admin aprovador e um user comum
	// só devolvia o admin).
	t.Run("should return every team member, not just current approvers", func(t *testing.T) {
		members, err := repo.GetTeamApprovers(context.Background(), teamID)
		assert.NoError(t, err)
		require.Len(t, members, 2)

		byUserID := map[string]*entity.TeamUserWithApprover{}
		for _, m := range members {
			byUserID[m.UserID] = m
			assert.NotEmpty(t, m.Username)
			assert.NotEmpty(t, m.Role)
		}

		require.Contains(t, byUserID, user1ID)
		require.Contains(t, byUserID, user2ID)
		assert.True(t, byUserID[user1ID].IsApprover)
		assert.False(t, byUserID[user2ID].IsApprover)
	})

	t.Run("should return every member even when none of them are approvers", func(t *testing.T) {
		// Create another team with a member who was never made an approver.
		newTeam := &entity.Team{
			ID:   "team-new",
			Name: "New Team",
		}
		require.NoError(t, db.Create(newTeam).Error)
		require.NoError(t, db.Create(&entity.TeamUser{TeamID: newTeam.ID, UserID: user1ID, IsApprover: false}).Error)

		members, err := repo.GetTeamApprovers(context.Background(), newTeam.ID)
		assert.NoError(t, err)
		require.Len(t, members, 1)
		assert.Equal(t, user1ID, members[0].UserID)
		assert.False(t, members[0].IsApprover)
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

func TestTeamApproverRepository_Integration(t *testing.T) {
	t.Run("complete workflow integration test", func(t *testing.T) {
		// Setup isolated test environment
		db := setupTeamApproverTestDB(t)
		user1ID, user2ID, teamID := createTestDataForTeamApprover(t, db)
		repo := NewTeamApproverRepository(db)

		// 1. GetTeamApprovers lists every team member — initially none are approvers
		members, err := repo.GetTeamApprovers(context.Background(), teamID)
		assert.NoError(t, err)
		require.Len(t, members, 2)
		for _, m := range members {
			assert.False(t, m.IsApprover)
		}

		// 2. Set user1 as approver
		err = repo.SetUserAsApprover(context.Background(), teamID, user1ID, true)
		assert.NoError(t, err)

		// 3. Verify user1 is approver
		isApprover, err := repo.IsUserApprover(context.Background(), teamID, user1ID)
		assert.NoError(t, err)
		assert.True(t, isApprover)

		// 4. Get team members — still both, only user1 flagged as approver
		members, err = repo.GetTeamApprovers(context.Background(), teamID)
		assert.NoError(t, err)
		require.Len(t, members, 2)
		byUserID := map[string]*entity.TeamUserWithApprover{}
		for _, m := range members {
			byUserID[m.UserID] = m
		}
		assert.True(t, byUserID[user1ID].IsApprover)
		assert.False(t, byUserID[user2ID].IsApprover)

		// 5. Get user approver teams
		teamIDs, err := repo.GetUserTeamsAsApprover(context.Background(), user1ID)
		assert.NoError(t, err)
		assert.Len(t, teamIDs, 1)
		assert.Equal(t, teamID, teamIDs[0])

		// 6. Set user2 as approver
		err = repo.SetUserAsApprover(context.Background(), teamID, user2ID, true)
		assert.NoError(t, err)

		// 7. Verify both members are now flagged as approvers
		members, err = repo.GetTeamApprovers(context.Background(), teamID)
		assert.NoError(t, err)
		require.Len(t, members, 2)
		for _, m := range members {
			assert.True(t, m.IsApprover)
		}

		// 8. Remove user1 approver status
		err = repo.SetUserAsApprover(context.Background(), teamID, user1ID, false)
		assert.NoError(t, err)

		// 9. Verify both are still listed as members, only user2 flagged as approver
		members, err = repo.GetTeamApprovers(context.Background(), teamID)
		assert.NoError(t, err)
		require.Len(t, members, 2)
		byUserID = map[string]*entity.TeamUserWithApprover{}
		for _, m := range members {
			byUserID[m.UserID] = m
		}
		assert.False(t, byUserID[user1ID].IsApprover)
		assert.True(t, byUserID[user2ID].IsApprover)
	})
}
