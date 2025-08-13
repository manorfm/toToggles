-- +goose Up
ALTER TABLE toggles ADD COLUMN has_activation_rule BOOLEAN DEFAULT FALSE;
ALTER TABLE toggles ADD COLUMN rule_type VARCHAR(50) DEFAULT NULL;
ALTER TABLE toggles ADD COLUMN rule_value VARCHAR(255) DEFAULT NULL;
ALTER TABLE toggles ADD COLUMN rule_config TEXT DEFAULT NULL;

-- +goose Down
ALTER TABLE toggles DROP COLUMN has_activation_rule;
ALTER TABLE toggles DROP COLUMN rule_type;
ALTER TABLE toggles DROP COLUMN rule_value;
ALTER TABLE toggles DROP COLUMN rule_config;