-- +goose Up
-- +goose StatementBegin

-- Reversibilidade de exclusão de toggle (v2.6 §4.1): apagar um toggle passa a ser recursivo (nó
-- + toda a subárvore, sem mais recusar quando o nó tem filhos — ver ToggleUseCase.DeleteToggleByID)
-- e reversível via soft-delete, não uma remoção física. deleted_at é o campo que o GORM reconhece
-- nativamente como soft-delete (gorm.DeletedAt no entity.Toggle) — toda query existente
-- (GetByID/GetByPath/GetChildren/etc.) passa a ignorar linhas apagadas automaticamente, sem
-- precisar reescrever cada uma com um WHERE deleted_at IS NULL manual.
-- archived_root marca só o nó que o usuário clicou pra apagar (não toda a subárvore em cascata) —
-- é o que a tela "Archived" lista, um item por operação de exclusão, não um item por nó.
ALTER TABLE toggles ADD COLUMN deleted_at DATETIME;
ALTER TABLE toggles ADD COLUMN deleted_by VARCHAR(26);
ALTER TABLE toggles ADD COLUMN archived_root BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX idx_toggles_deleted_at ON toggles(deleted_at);
CREATE INDEX idx_toggles_archived_root ON toggles(app_id, archived_root);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP INDEX idx_toggles_archived_root;
DROP INDEX idx_toggles_deleted_at;
ALTER TABLE toggles DROP COLUMN archived_root;
ALTER TABLE toggles DROP COLUMN deleted_by;
ALTER TABLE toggles DROP COLUMN deleted_at;

-- +goose StatementEnd
