-- +goose Up
-- +goose StatementBegin

-- Adicionar coluna active na tabela secret_keys — uma chave criada via fluxo de aprovação nasce
-- com active=false (só ativada quando a solicitação é aprovada), pra que o valor em texto puro
-- possa ser entregue a quem pediu na hora da solicitação sem já autenticar nada. Chaves criadas
-- fora do fluxo de aprovação continuam ativas desde a criação. Ver ApprovalUseCase.
ALTER TABLE secret_keys ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE secret_keys DROP COLUMN active;

-- +goose StatementEnd
