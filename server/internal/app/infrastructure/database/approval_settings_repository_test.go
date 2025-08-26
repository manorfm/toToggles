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

func setupApprovalSettingsTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	// Auto migrate ApprovalSettings table
	err = db.AutoMigrate(&entity.ApprovalSettings{})
	require.NoError(t, err)

	return db
}

func TestApprovalSettingsRepository_Create(t *testing.T) {
	db := setupApprovalSettingsTestDB(t)
	repo := NewApprovalSettingsRepository(db)

	t.Run("should create approval settings successfully", func(t *testing.T) {
		settings := entity.NewApprovalSettings()

		err := repo.Create(context.Background(), settings)
		assert.NoError(t, err)
		assert.NotEmpty(t, settings.ID)
	})

	t.Run("should handle duplicate creation", func(t *testing.T) {
		settings := entity.NewApprovalSettings()
		originalID := settings.ID

		// First creation
		err := repo.Create(context.Background(), settings)
		require.NoError(t, err)

		// Second creation with same ID should fail
		duplicateSettings := &entity.ApprovalSettings{
			ID:                    originalID,
			ApprovalEnabled:       true,
			DefaultExpirationDays: 14,
		}

		err = repo.Create(context.Background(), duplicateSettings)
		assert.Error(t, err)
	})
}

func TestApprovalSettingsRepository_Get(t *testing.T) {
	db := setupApprovalSettingsTestDB(t)
	repo := NewApprovalSettingsRepository(db)

	t.Run("should create default settings when none exist", func(t *testing.T) {
		settings, err := repo.Get(context.Background())
		assert.NoError(t, err)
		assert.NotNil(t, settings)
		assert.NotEmpty(t, settings.ID)
		assert.False(t, settings.ApprovalEnabled)
		assert.Equal(t, 7, settings.DefaultExpirationDays)

		// Verify it was actually saved to database
		var count int64
		db.Model(&entity.ApprovalSettings{}).Count(&count)
		assert.Equal(t, int64(1), count)
	})

	t.Run("should return existing settings when they exist", func(t *testing.T) {
		// First call creates settings
		firstSettings, err := repo.Get(context.Background())
		require.NoError(t, err)

		// Modify the settings
		firstSettings.ApprovalEnabled = true
		firstSettings.DefaultExpirationDays = 14
		err = repo.Update(context.Background(), firstSettings)
		require.NoError(t, err)

		// Second call should return the modified settings
		secondSettings, err := repo.Get(context.Background())
		assert.NoError(t, err)
		assert.Equal(t, firstSettings.ID, secondSettings.ID)
		assert.True(t, secondSettings.ApprovalEnabled)
		assert.Equal(t, 14, secondSettings.DefaultExpirationDays)
	})
}

func TestApprovalSettingsRepository_Update(t *testing.T) {
	db := setupApprovalSettingsTestDB(t)
	repo := NewApprovalSettingsRepository(db)

	// Create initial settings
	settings, err := repo.Get(context.Background())
	require.NoError(t, err)

	t.Run("should update settings successfully", func(t *testing.T) {
		// Modify settings
		settings.ApprovalEnabled = true
		settings.DefaultExpirationDays = 21

		// Get and modify required actions
		config, err := settings.GetRequiredActions()
		require.NoError(t, err)
		config.ToggleCreate = true
		config.ApplicationCreate = false
		err = settings.SetRequiredActions(config)
		require.NoError(t, err)

		// Update in database
		err = repo.Update(context.Background(), settings)
		assert.NoError(t, err)

		// Verify update
		updated, err := repo.Get(context.Background())
		require.NoError(t, err)
		assert.True(t, updated.ApprovalEnabled)
		assert.Equal(t, 21, updated.DefaultExpirationDays)

		// Verify required actions were updated
		updatedConfig, err := updated.GetRequiredActions()
		require.NoError(t, err)
		assert.True(t, updatedConfig.ToggleCreate)
		assert.False(t, updatedConfig.ApplicationCreate)
	})

	t.Run("should handle validation errors", func(t *testing.T) {
		// Create invalid settings - modify the existing settings instead of creating new ones
		settings.DefaultExpirationDays = 0 // Invalid value

		err := repo.Update(context.Background(), settings)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "default_expiration_days must be between 1 and 30")
	})
}

func TestApprovalSettingsRepository_IsApprovalEnabled(t *testing.T) {
	db := setupApprovalSettingsTestDB(t)
	repo := NewApprovalSettingsRepository(db)

	t.Run("should return false when approval is disabled", func(t *testing.T) {
		settings, err := repo.Get(context.Background())
		require.NoError(t, err)
		settings.ApprovalEnabled = false
		require.NoError(t, repo.Update(context.Background(), settings))

		enabled, err := repo.IsApprovalEnabled(context.Background())
		assert.NoError(t, err)
		assert.False(t, enabled)
	})

	t.Run("should return true when approval is enabled", func(t *testing.T) {
		settings, err := repo.Get(context.Background())
		require.NoError(t, err)
		settings.ApprovalEnabled = true
		require.NoError(t, repo.Update(context.Background(), settings))

		enabled, err := repo.IsApprovalEnabled(context.Background())
		assert.NoError(t, err)
		assert.True(t, enabled)
	})
}

func TestApprovalSettingsRepository_RequiresApproval(t *testing.T) {
	db := setupApprovalSettingsTestDB(t)
	repo := NewApprovalSettingsRepository(db)

	t.Run("should return false when approval is disabled", func(t *testing.T) {
		settings, err := repo.Get(context.Background())
		require.NoError(t, err)
		settings.ApprovalEnabled = false
		require.NoError(t, repo.Update(context.Background(), settings))

		requires, err := repo.RequiresApproval(context.Background(), entity.ApprovalActionToggleDelete)
		assert.NoError(t, err)
		assert.False(t, requires)
	})

	t.Run("should return correct values when approval is enabled", func(t *testing.T) {
		settings, err := repo.Get(context.Background())
		require.NoError(t, err)
		settings.ApprovalEnabled = true
		require.NoError(t, repo.Update(context.Background(), settings))

		// Test default values (toggle delete should require approval by default)
		requires, err := repo.RequiresApproval(context.Background(), entity.ApprovalActionToggleDelete)
		assert.NoError(t, err)
		assert.True(t, requires)

		// Test default values (toggle create should not require approval by default)
		requires, err = repo.RequiresApproval(context.Background(), entity.ApprovalActionToggleCreate)
		assert.NoError(t, err)
		assert.False(t, requires)
	})

	t.Run("should handle custom configuration", func(t *testing.T) {
		settings, err := repo.Get(context.Background())
		require.NoError(t, err)
		settings.ApprovalEnabled = true

		// Modify configuration
		config, err := settings.GetRequiredActions()
		require.NoError(t, err)
		config.ToggleCreate = true  // Enable approval for toggle create
		config.ToggleDelete = false // Disable approval for toggle delete
		err = settings.SetRequiredActions(config)
		require.NoError(t, err)
		require.NoError(t, repo.Update(context.Background(), settings))

		// Test modified configuration
		requires, err := repo.RequiresApproval(context.Background(), entity.ApprovalActionToggleCreate)
		assert.NoError(t, err)
		assert.True(t, requires)

		requires, err = repo.RequiresApproval(context.Background(), entity.ApprovalActionToggleDelete)
		assert.NoError(t, err)
		assert.False(t, requires)
	})

	t.Run("should handle all action types", func(t *testing.T) {
		settings, err := repo.Get(context.Background())
		require.NoError(t, err)
		settings.ApprovalEnabled = true
		require.NoError(t, repo.Update(context.Background(), settings))

		actionTypes := []entity.ApprovalActionType{
			entity.ApprovalActionToggleCreate,
			entity.ApprovalActionToggleUpdate,
			entity.ApprovalActionToggleDelete,
			entity.ApprovalActionToggleEnable,
			entity.ApprovalActionToggleDisable,
			entity.ApprovalActionToggleRule,
			entity.ApprovalActionApplicationCreate,
			entity.ApprovalActionApplicationDelete,
			entity.ApprovalActionSecretKeyCreate,
			entity.ApprovalActionSecretKeyDelete,
		}

		for _, actionType := range actionTypes {
			// Should return a boolean value without error
			result, err := repo.RequiresApproval(context.Background(), actionType)
			assert.NoError(t, err)
			assert.IsType(t, bool(false), result)
		}
	})

	t.Run("should return false for unknown action type", func(t *testing.T) {
		settings, err := repo.Get(context.Background())
		require.NoError(t, err)
		settings.ApprovalEnabled = true
		require.NoError(t, repo.Update(context.Background(), settings))

		requires, err := repo.RequiresApproval(context.Background(), entity.ApprovalActionType("unknown_action"))
		assert.NoError(t, err)
		assert.False(t, requires)
	})
}

func TestApprovalSettingsRepository_GetExpirationDays(t *testing.T) {
	db := setupApprovalSettingsTestDB(t)
	repo := NewApprovalSettingsRepository(db)

	t.Run("should return default expiration days", func(t *testing.T) {
		days, err := repo.GetExpirationDays(context.Background())
		assert.NoError(t, err)
		assert.Equal(t, 7, days)
	})

	t.Run("should return custom expiration days", func(t *testing.T) {
		settings, err := repo.Get(context.Background())
		require.NoError(t, err)
		settings.DefaultExpirationDays = 14
		require.NoError(t, repo.Update(context.Background(), settings))

		days, err := repo.GetExpirationDays(context.Background())
		assert.NoError(t, err)
		assert.Equal(t, 14, days)
	})
}

func TestApprovalSettingsRepository_Integration(t *testing.T) {
	db := setupApprovalSettingsTestDB(t)
	repo := NewApprovalSettingsRepository(db)

	t.Run("complete workflow integration test", func(t *testing.T) {
		// 1. Get should create default settings
		settings, err := repo.Get(context.Background())
		assert.NoError(t, err)
		assert.NotNil(t, settings)
		assert.False(t, settings.ApprovalEnabled)
		assert.Equal(t, 7, settings.DefaultExpirationDays)

		// 2. Enable approval system
		settings.ApprovalEnabled = true
		err = repo.Update(context.Background(), settings)
		assert.NoError(t, err)

		// 3. Verify approval is enabled
		enabled, err := repo.IsApprovalEnabled(context.Background())
		assert.NoError(t, err)
		assert.True(t, enabled)

		// 4. Configure required actions
		config, err := settings.GetRequiredActions()
		require.NoError(t, err)
		config.ToggleCreate = true
		config.ApplicationCreate = false
		err = settings.SetRequiredActions(config)
		require.NoError(t, err)
		err = repo.Update(context.Background(), settings)
		assert.NoError(t, err)

		// 5. Test approval requirements
		requires, err := repo.RequiresApproval(context.Background(), entity.ApprovalActionToggleCreate)
		assert.NoError(t, err)
		assert.True(t, requires)

		requires, err = repo.RequiresApproval(context.Background(), entity.ApprovalActionApplicationCreate)
		assert.NoError(t, err)
		assert.False(t, requires)

		// 6. Test expiration days
		days, err := repo.GetExpirationDays(context.Background())
		assert.NoError(t, err)
		assert.Equal(t, 7, days)

		// 7. Disable approval system
		settings.ApprovalEnabled = false
		err = repo.Update(context.Background(), settings)
		assert.NoError(t, err)

		// 8. Verify no action requires approval when disabled
		enabled, err = repo.IsApprovalEnabled(context.Background())
		assert.NoError(t, err)
		assert.False(t, enabled)

		requires, err = repo.RequiresApproval(context.Background(), entity.ApprovalActionToggleCreate)
		assert.NoError(t, err)
		assert.False(t, requires)
	})
}