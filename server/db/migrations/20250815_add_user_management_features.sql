-- +goose Up
-- +goose StatementBegin

-- Adicionar campo must_change_password na tabela users
ALTER TABLE users ADD COLUMN must_change_password BOOLEAN DEFAULT FALSE;

-- Atualizar o enum de roles para incluir root
-- Como SQLite não suporta ALTER TYPE diretamente, não fazemos nada aqui
-- O GORM vai lidar com a validação no código Go

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- Remover campo must_change_password
ALTER TABLE users DROP COLUMN must_change_password;

-- +goose StatementEnd