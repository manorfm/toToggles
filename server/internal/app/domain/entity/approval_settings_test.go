package entity

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewApprovalSettings(t *testing.T) {
	t.Run("should create default approval settings", func(t *testing.T) {
		settings := NewApprovalSettings()

		assert.NotNil(t, settings)
		assert.NotEmpty(t, settings.ID)
		assert.False(t, settings.ApprovalEnabled)
		assert.Equal(t, 7, settings.DefaultExpirationDays)
		assert.NotNil(t, settings.RequiredActions)

		// Verificar configurações padrão
		config, err := settings.GetRequiredActions()
		assert.NoError(t, err)
		assert.False(t, config.ToggleCreate)
		assert.False(t, config.ToggleUpdate)
		assert.True(t, config.ToggleDelete)
		assert.False(t, config.ToggleEnable)
		assert.False(t, config.ToggleDisable)
		assert.True(t, config.ToggleRule)
		assert.True(t, config.ApplicationCreate)
		assert.True(t, config.ApplicationDelete)
		assert.True(t, config.SecretKeyCreate)
		assert.True(t, config.SecretKeyDelete)
	})
}

func TestApprovalSettings_GetSetRequiredActions(t *testing.T) {
	t.Run("should get and set required actions", func(t *testing.T) {
		settings := NewApprovalSettings()

		// Modificar configuração
		config, err := settings.GetRequiredActions()
		assert.NoError(t, err)

		config.ToggleCreate = true
		config.ToggleUpdate = true
		config.ApplicationCreate = false

		err = settings.SetRequiredActions(config)
		assert.NoError(t, err)

		// Verificar se foi salvo corretamente
		savedConfig, err := settings.GetRequiredActions()
		assert.NoError(t, err)
		assert.True(t, savedConfig.ToggleCreate)
		assert.True(t, savedConfig.ToggleUpdate)
		assert.False(t, savedConfig.ApplicationCreate)
	})
}

func TestApprovalSettings_RequiresApproval(t *testing.T) {
	settings := NewApprovalSettings()

	t.Run("should return false when approval is disabled", func(t *testing.T) {
		settings.ApprovalEnabled = false
		result := settings.RequiresApproval(ApprovalActionToggleDelete)
		assert.False(t, result)
	})

	t.Run("should return correct values when approval is enabled", func(t *testing.T) {
		settings.ApprovalEnabled = true

		// Teste com ação que deve precisar aprovação (padrão)
		result := settings.RequiresApproval(ApprovalActionToggleDelete)
		assert.True(t, result)

		// Teste com ação que não deve precisar aprovação (padrão)
		result = settings.RequiresApproval(ApprovalActionToggleCreate)
		assert.False(t, result)

		// Modificar configuração
		config, _ := settings.GetRequiredActions()
		config.ToggleCreate = true
		settings.SetRequiredActions(config)

		// Verificar mudança
		result = settings.RequiresApproval(ApprovalActionToggleCreate)
		assert.True(t, result)
	})

	t.Run("should handle all action types", func(t *testing.T) {
		settings.ApprovalEnabled = true

		actionTypes := []ApprovalActionType{
			ApprovalActionToggleCreate,
			ApprovalActionToggleUpdate,
			ApprovalActionToggleDelete,
			ApprovalActionToggleEnable,
			ApprovalActionToggleDisable,
			ApprovalActionToggleRule,
			ApprovalActionApplicationCreate,
			ApprovalActionApplicationDelete,
			ApprovalActionSecretKeyCreate,
			ApprovalActionSecretKeyDelete,
		}

		for _, actionType := range actionTypes {
			// Deve retornar um valor booleano sem erro
			result := settings.RequiresApproval(actionType)
			assert.IsType(t, bool(false), result)
		}
	})

	t.Run("should return false for unknown action type", func(t *testing.T) {
		settings.ApprovalEnabled = true
		result := settings.RequiresApproval(ApprovalActionType("unknown_action"))
		assert.False(t, result)
	})
}

func TestApprovalSettings_EnableDisable(t *testing.T) {
	settings := NewApprovalSettings()

	t.Run("should enable approval system", func(t *testing.T) {
		settings.Enable()
		assert.True(t, settings.ApprovalEnabled)
	})

	t.Run("should disable approval system", func(t *testing.T) {
		settings.Disable()
		assert.False(t, settings.ApprovalEnabled)
	})
}

func TestApprovalSettings_SetExpirationDays(t *testing.T) {
	settings := NewApprovalSettings()

	t.Run("should set valid expiration days", func(t *testing.T) {
		err := settings.SetExpirationDays(14)
		assert.NoError(t, err)
		assert.Equal(t, 14, settings.DefaultExpirationDays)
	})

	t.Run("should reject expiration days less than 1", func(t *testing.T) {
		err := settings.SetExpirationDays(0)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "between 1 and 30")
	})

	t.Run("should reject expiration days greater than 30", func(t *testing.T) {
		err := settings.SetExpirationDays(31)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "between 1 and 30")
	})

	t.Run("should accept boundary values", func(t *testing.T) {
		err := settings.SetExpirationDays(1)
		assert.NoError(t, err)
		assert.Equal(t, 1, settings.DefaultExpirationDays)

		err = settings.SetExpirationDays(30)
		assert.NoError(t, err)
		assert.Equal(t, 30, settings.DefaultExpirationDays)
	})
}

func TestApprovalSettings_Validate(t *testing.T) {
	t.Run("should validate valid settings", func(t *testing.T) {
		settings := NewApprovalSettings()
		err := settings.Validate()
		assert.NoError(t, err)
	})

	t.Run("should fail validation for invalid expiration days", func(t *testing.T) {
		settings := NewApprovalSettings()
		settings.DefaultExpirationDays = 0

		err := settings.Validate()
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "default_expiration_days")
	})

	t.Run("should fail validation for invalid JSON in required actions", func(t *testing.T) {
		settings := NewApprovalSettings()
		settings.RequiredActions = "invalid json"

		err := settings.Validate()
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "invalid required_actions format")
	})
}

func TestApprovalSettings_ToResponse(t *testing.T) {
	t.Run("should convert to response format", func(t *testing.T) {
		settings := NewApprovalSettings()
		settings.ApprovalEnabled = true

		response, err := settings.ToResponse()
		assert.NoError(t, err)
		assert.NotNil(t, response)
		assert.Equal(t, settings.ID, response.ID)
		assert.Equal(t, settings.ApprovalEnabled, response.ApprovalEnabled)
		assert.Equal(t, settings.DefaultExpirationDays, response.DefaultExpirationDays)
		assert.NotNil(t, response.RequiredActions)
	})

	t.Run("should handle invalid JSON in required actions", func(t *testing.T) {
		settings := NewApprovalSettings()
		settings.RequiredActions = "invalid json"

		response, err := settings.ToResponse()
		assert.Error(t, err)
		assert.Nil(t, response)
	})
}

func TestApprovalSettings_ApplyUpdate(t *testing.T) {
	settings := NewApprovalSettings()

	t.Run("should apply approval enabled update", func(t *testing.T) {
		enabled := true
		req := &UpdateApprovalSettingsRequest{
			ApprovalEnabled: &enabled,
		}

		err := settings.ApplyUpdate(req)
		assert.NoError(t, err)
		assert.True(t, settings.ApprovalEnabled)
	})

	t.Run("should apply required actions update", func(t *testing.T) {
		newConfig := &ApprovalConfig{
			ToggleCreate: true,
			ToggleUpdate: true,
		}
		req := &UpdateApprovalSettingsRequest{
			RequiredActions: newConfig,
		}

		err := settings.ApplyUpdate(req)
		assert.NoError(t, err)

		savedConfig, err := settings.GetRequiredActions()
		assert.NoError(t, err)
		assert.True(t, savedConfig.ToggleCreate)
		assert.True(t, savedConfig.ToggleUpdate)
	})

	t.Run("should apply expiration days update", func(t *testing.T) {
		days := 14
		req := &UpdateApprovalSettingsRequest{
			DefaultExpirationDays: &days,
		}

		err := settings.ApplyUpdate(req)
		assert.NoError(t, err)
		assert.Equal(t, 14, settings.DefaultExpirationDays)
	})

	t.Run("should apply multiple updates", func(t *testing.T) {
		enabled := true
		days := 21
		newConfig := &ApprovalConfig{
			ApplicationCreate: false,
		}

		req := &UpdateApprovalSettingsRequest{
			ApprovalEnabled:       &enabled,
			RequiredActions:       newConfig,
			DefaultExpirationDays: &days,
		}

		err := settings.ApplyUpdate(req)
		assert.NoError(t, err)

		assert.True(t, settings.ApprovalEnabled)
		assert.Equal(t, 21, settings.DefaultExpirationDays)

		savedConfig, err := settings.GetRequiredActions()
		assert.NoError(t, err)
		assert.False(t, savedConfig.ApplicationCreate)
	})

	t.Run("should fail validation after invalid update", func(t *testing.T) {
		invalidDays := 0
		req := &UpdateApprovalSettingsRequest{
			DefaultExpirationDays: &invalidDays,
		}

		err := settings.ApplyUpdate(req)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "between 1 and 30")
	})

	t.Run("should handle nil updates", func(t *testing.T) {
		originalEnabled := settings.ApprovalEnabled
		originalDays := settings.DefaultExpirationDays

		req := &UpdateApprovalSettingsRequest{}

		err := settings.ApplyUpdate(req)
		assert.NoError(t, err)

		// Valores não devem ter mudado
		assert.Equal(t, originalEnabled, settings.ApprovalEnabled)
		assert.Equal(t, originalDays, settings.DefaultExpirationDays)
	})
}