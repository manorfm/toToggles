package toggle

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Matches the real public GET /api/toggles response shape (server/internal/app/handler/
// secret_key_handler.go): activation_rule is JSON null whenever has_activation_rule is false —
// the field is a Go *ActivationRule pointer, never the empty-object shape the internal/admin
// endpoint uses. A Toggle.ActivationRule that can't represent null here would fail to parse the
// common case (most toggles have no rule) — this is the exact bug found and fixed in
// totoggle_java's model/Toggle.kt this session; this Go client is built with the fix in place
// from the start rather than needing the same regression found twice.
func TestToggle_UnmarshalJSON_NoRule(t *testing.T) {
	raw := `{
		"id": "toggle-1",
		"path": "user",
		"value": "user",
		"enabled": true,
		"level": 0,
		"parent_id": null,
		"app_id": "app-123",
		"has_activation_rule": false,
		"activation_rule": null
	}`

	var tg Toggle
	require.NoError(t, json.Unmarshal([]byte(raw), &tg))

	assert.Equal(t, "toggle-1", tg.ID)
	assert.Equal(t, "user", tg.Path.String())
	assert.True(t, tg.Enabled)
	assert.Nil(t, tg.ParentID)
	assert.False(t, tg.HasActivationRule)
	assert.Nil(t, tg.ActivationRule)
}

func TestToggle_UnmarshalJSON_WithRuleAndParent(t *testing.T) {
	raw := `{
		"id": "toggle-3",
		"path": "user.payments.view-table",
		"value": "view-table",
		"enabled": true,
		"level": 2,
		"parent_id": "toggle-2",
		"app_id": "app-123",
		"has_activation_rule": true,
		"activation_rule": {"type": "percentage", "value": "25"}
	}`

	var tg Toggle
	require.NoError(t, json.Unmarshal([]byte(raw), &tg))

	assert.Equal(t, "user.payments.view-table", tg.Path.String())
	require.NotNil(t, tg.ParentID)
	assert.Equal(t, "toggle-2", *tg.ParentID)
	require.NotNil(t, tg.ActivationRule)
	assert.Equal(t, RuleTypePercentage, tg.ActivationRule.Type)
	assert.Equal(t, "25", tg.ActivationRule.Value)
}

func TestToggle_UnmarshalJSON_InvalidPathFailsTheWholeDecode(t *testing.T) {
	raw := `{"id": "x", "path": "", "value": "x", "enabled": true, "level": 0, "app_id": "app-123", "has_activation_rule": false, "activation_rule": null}`

	var tg Toggle
	err := json.Unmarshal([]byte(raw), &tg)
	require.Error(t, err)
}
