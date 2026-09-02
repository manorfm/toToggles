-- +goose Up
-- +goose StatementBegin

-- Adicionar coluna name (nome completo, distinto do username) na tabela users — confirmado no
-- protótipo real (get_full_jsx("UserModal"), UserRow, HistoryView): "Nome completo" é um campo
-- próprio na criação, usado como label principal em UserRow ({user.name}, com @{username} como
-- linha secundária) e como o `actor`/base dos `initials` no audit trail (currentUser.name), não
-- o username. Contas existentes não têm um nome real cadastrado — backfill com o username como
-- melhor aproximação disponível (nunca fica vazio, coluna é NOT NULL).
ALTER TABLE users ADD COLUMN name VARCHAR(150) NOT NULL DEFAULT '';
UPDATE users SET name = username WHERE name = '';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE users DROP COLUMN name;

-- +goose StatementEnd
