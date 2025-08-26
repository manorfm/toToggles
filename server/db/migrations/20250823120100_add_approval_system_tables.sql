-- +goose Up
-- +goose StatementBegin

-- Tabela de configurações globais do sistema de aprovação
CREATE TABLE approval_settings (
    id VARCHAR(26) PRIMARY KEY,
    approval_enabled BOOLEAN DEFAULT FALSE, -- Root habilita/desabilita o sistema
    required_actions TEXT NOT NULL, -- JSON com quais ações precisam aprovação
    default_expiration_days INTEGER DEFAULT 7, -- Dias para expirar solicitações
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de solicitações de aprovação
CREATE TABLE approval_requests (
    id VARCHAR(26) PRIMARY KEY,
    action_type VARCHAR(50) NOT NULL, -- Tipo da ação (toggle_create, toggle_update, etc.)
    description VARCHAR(500), -- Descrição da solicitação
    requested_by VARCHAR(26) NOT NULL, -- ID do usuário que solicitou
    team_id VARCHAR(26) NOT NULL, -- ID do time
    application_id VARCHAR(26), -- ID da aplicação (pode ser NULL)
    toggle_id VARCHAR(26), -- ID do toggle (pode ser NULL)
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, approved, rejected, expired
    action_data TEXT, -- Dados da ação original em JSON
    approved_by VARCHAR(26), -- ID do usuário que aprovou
    approved_at TIMESTAMP, -- Data/hora da aprovação
    rejected_by VARCHAR(26), -- ID do usuário que rejeitou
    rejected_at TIMESTAMP, -- Data/hora da rejeição
    rejection_reason VARCHAR(500), -- Motivo da rejeição
    expires_at TIMESTAMP NOT NULL, -- Data/hora de expiração
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    FOREIGN KEY (toggle_id) REFERENCES toggles(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (rejected_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Índices para performance
CREATE INDEX idx_approval_requests_status ON approval_requests(status);
CREATE INDEX idx_approval_requests_requested_by ON approval_requests(requested_by);
CREATE INDEX idx_approval_requests_team_id ON approval_requests(team_id);
CREATE INDEX idx_approval_requests_application_id ON approval_requests(application_id);
CREATE INDEX idx_approval_requests_toggle_id ON approval_requests(toggle_id);
CREATE INDEX idx_approval_requests_action_type ON approval_requests(action_type);
CREATE INDEX idx_approval_requests_expires_at ON approval_requests(expires_at);
CREATE INDEX idx_approval_requests_created_at ON approval_requests(created_at);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- Remover índices
DROP INDEX IF EXISTS idx_approval_requests_created_at;
DROP INDEX IF EXISTS idx_approval_requests_expires_at;
DROP INDEX IF EXISTS idx_approval_requests_action_type;
DROP INDEX IF EXISTS idx_approval_requests_toggle_id;
DROP INDEX IF EXISTS idx_approval_requests_application_id;
DROP INDEX IF EXISTS idx_approval_requests_team_id;
DROP INDEX IF EXISTS idx_approval_requests_requested_by;
DROP INDEX IF EXISTS idx_approval_requests_status;

-- Remover tabelas
DROP TABLE IF EXISTS approval_requests;
DROP TABLE IF EXISTS approval_settings;

-- +goose StatementEnd