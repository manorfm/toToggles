-- +goose Up
-- +goose StatementBegin

-- Audit trail append-only — inexistente antes desta migration (o único rastro real de mudanças
-- era approval_requests, e só cobria o que passou pelo workflow de aprovação). team_id escopa
-- a visibilidade (domain/policy.AuditAccess); null só em eventos globais (hoje, só o on/off do
-- sistema de aprovação), sempre root-only independente disso.
CREATE TABLE audit_logs (
    id VARCHAR(26) PRIMARY KEY,
    event_type VARCHAR(40) NOT NULL,
    category VARCHAR(20) NOT NULL,
    text VARCHAR(255) NOT NULL,
    target VARCHAR(255),
    team_id VARCHAR(26),
    actor_id VARCHAR(26) NOT NULL,
    actor_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL
);

CREATE INDEX idx_audit_logs_category ON audit_logs(category);
CREATE INDEX idx_audit_logs_team_id ON audit_logs(team_id);
-- Ordenação/cursor real da listagem é (created_at DESC, id DESC) — índice composto cobre os
-- dois sentidos da comparação de cursor sem precisar escanear a tabela inteira.
CREATE INDEX idx_audit_logs_created_at_id ON audit_logs(created_at DESC, id DESC);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP INDEX IF EXISTS idx_audit_logs_created_at_id;
DROP INDEX IF EXISTS idx_audit_logs_team_id;
DROP INDEX IF EXISTS idx_audit_logs_category;
DROP TABLE IF EXISTS audit_logs;

-- +goose StatementEnd
