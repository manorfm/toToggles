-- +goose Up
-- +goose StatementBegin

-- v2.6 §7: application_id alimenta a Activity tab por aplicação (GET /applications/:id/audit) —
-- sem FK explícita, mesmo padrão já usado por toggles.deleted_by (ALTER TABLE ADD COLUMN com FK
-- teria que lidar com as restrições do SQLite pra alterar tabela existente; a aplicação sempre
-- valida a referência em código, nunca no banco, pra esta coluna). before/after guardam o estado
-- textual antes/depois de uma mudança de regra de ativação (hoje o único evento que os popula).
ALTER TABLE audit_logs ADD COLUMN application_id VARCHAR(26);
ALTER TABLE audit_logs ADD COLUMN before_value VARCHAR(255);
ALTER TABLE audit_logs ADD COLUMN after_value VARCHAR(255);

CREATE INDEX idx_audit_logs_application_id ON audit_logs(application_id);
-- Falta um índice em actor_id desde a criação da tabela — o filtro por ator (AuditToolbar) agora
-- faz esta coluna parte do WHERE de toda listagem, não só do Create.
CREATE INDEX idx_audit_logs_actor_id ON audit_logs(actor_id);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP INDEX IF EXISTS idx_audit_logs_actor_id;
DROP INDEX IF EXISTS idx_audit_logs_application_id;
ALTER TABLE audit_logs DROP COLUMN after_value;
ALTER TABLE audit_logs DROP COLUMN before_value;
ALTER TABLE audit_logs DROP COLUMN application_id;

-- +goose StatementEnd
