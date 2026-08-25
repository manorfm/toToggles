-- +goose Up
-- +goose StatementBegin

-- Adicionar coluna active na tabela users — desativado bloqueia login sem apagar a conta.
-- Confirmado no protótipo (UsersView/UserRow/StatusPill): status "disabled" vs "active"/
-- "pending_first_login" (este último derivado de must_change_password, não uma coluna nova).
ALTER TABLE users ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE users DROP COLUMN active;

-- +goose StatementEnd
