-- +goose Up
-- +goose StatementBegin

-- Adicionar coluna is_approver na tabela team_users
ALTER TABLE team_users ADD COLUMN is_approver BOOLEAN DEFAULT FALSE;

-- Criar índice para performance de consultas de aprovadores
CREATE INDEX idx_team_users_is_approver ON team_users(is_approver);
CREATE INDEX idx_team_users_team_approver ON team_users(team_id, is_approver);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- Remover índices
DROP INDEX IF EXISTS idx_team_users_team_approver;
DROP INDEX IF EXISTS idx_team_users_is_approver;

-- Remover coluna is_approver
ALTER TABLE team_users DROP COLUMN is_approver;

-- +goose StatementEnd