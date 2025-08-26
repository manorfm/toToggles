-- +goose Up
-- +goose StatementBegin

-- Optimize approval_requests table by consolidating 4 columns into 2
-- Instead of: approved_by, approved_at, rejected_by, rejected_at
-- Use: actioned_by, actioned_at (status already indicates approved/rejected)

-- Add the new columns
ALTER TABLE approval_requests ADD COLUMN actioned_by VARCHAR(26);
ALTER TABLE approval_requests ADD COLUMN actioned_at TIMESTAMP;

-- Migrate existing data
-- For approved requests
UPDATE approval_requests 
SET actioned_by = approved_by, actioned_at = approved_at 
WHERE status = 'approved' AND approved_by IS NOT NULL;

-- For rejected requests  
UPDATE approval_requests 
SET actioned_by = rejected_by, actioned_at = rejected_at 
WHERE status = 'rejected' AND rejected_by IS NOT NULL;

-- Add foreign key constraint for actioned_by
-- SQLite doesn't support adding foreign key constraints to existing tables directly
-- So we'll create a new table and migrate data

-- Create the optimized table
CREATE TABLE approval_requests_new (
    id VARCHAR(26) PRIMARY KEY,
    action_type VARCHAR(50) NOT NULL, -- Tipo da ação (toggle_create, toggle_update, etc.)
    description VARCHAR(500), -- Descrição da solicitação
    requested_by VARCHAR(26) NOT NULL, -- ID do usuário que solicitou
    team_id VARCHAR(26) NOT NULL, -- ID do time
    application_id VARCHAR(26), -- ID da aplicação (pode ser NULL)
    toggle_id VARCHAR(26), -- ID do toggle (pode ser NULL)
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, approved, rejected, expired
    action_data TEXT, -- Dados da ação original em JSON
    actioned_by VARCHAR(26), -- ID do usuário que aprovou/rejeitou
    actioned_at TIMESTAMP, -- Data/hora da aprovação/rejeição
    rejection_reason VARCHAR(500), -- Motivo da rejeição (apenas para rejected)
    expires_at TIMESTAMP NOT NULL, -- Data/hora de expiração
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    FOREIGN KEY (toggle_id) REFERENCES toggles(id) ON DELETE CASCADE,
    FOREIGN KEY (actioned_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Copy all data to new table
INSERT INTO approval_requests_new (
    id, action_type, description, requested_by, team_id, application_id, 
    toggle_id, status, action_data, actioned_by, actioned_at, 
    rejection_reason, expires_at, created_at, updated_at
)
SELECT 
    id, action_type, description, requested_by, team_id, application_id,
    toggle_id, status, action_data, actioned_by, actioned_at,
    rejection_reason, expires_at, created_at, updated_at
FROM approval_requests;

-- Drop old table and rename new one
DROP TABLE approval_requests;
ALTER TABLE approval_requests_new RENAME TO approval_requests;

-- Recreate indexes
CREATE INDEX idx_approval_requests_status ON approval_requests(status);
CREATE INDEX idx_approval_requests_requested_by ON approval_requests(requested_by);
CREATE INDEX idx_approval_requests_team_id ON approval_requests(team_id);
CREATE INDEX idx_approval_requests_application_id ON approval_requests(application_id);
CREATE INDEX idx_approval_requests_toggle_id ON approval_requests(toggle_id);
CREATE INDEX idx_approval_requests_action_type ON approval_requests(action_type);
CREATE INDEX idx_approval_requests_expires_at ON approval_requests(expires_at);
CREATE INDEX idx_approval_requests_created_at ON approval_requests(created_at);
CREATE INDEX idx_approval_requests_actioned_by ON approval_requests(actioned_by);
CREATE INDEX idx_approval_requests_actioned_at ON approval_requests(actioned_at);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- Reverse the optimization by recreating the original 4 columns structure
CREATE TABLE approval_requests_old (
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

-- Migrate data back
INSERT INTO approval_requests_old (
    id, action_type, description, requested_by, team_id, application_id,
    toggle_id, status, action_data, approved_by, approved_at, rejected_by, rejected_at,
    rejection_reason, expires_at, created_at, updated_at
)
SELECT 
    id, action_type, description, requested_by, team_id, application_id,
    toggle_id, status, action_data,
    CASE WHEN status = 'approved' THEN actioned_by END as approved_by,
    CASE WHEN status = 'approved' THEN actioned_at END as approved_at,
    CASE WHEN status = 'rejected' THEN actioned_by END as rejected_by,
    CASE WHEN status = 'rejected' THEN actioned_at END as rejected_at,
    rejection_reason, expires_at, created_at, updated_at
FROM approval_requests;

-- Replace table
DROP TABLE approval_requests;
ALTER TABLE approval_requests_old RENAME TO approval_requests;

-- Recreate original indexes
CREATE INDEX idx_approval_requests_status ON approval_requests(status);
CREATE INDEX idx_approval_requests_requested_by ON approval_requests(requested_by);
CREATE INDEX idx_approval_requests_team_id ON approval_requests(team_id);
CREATE INDEX idx_approval_requests_application_id ON approval_requests(application_id);
CREATE INDEX idx_approval_requests_toggle_id ON approval_requests(toggle_id);
CREATE INDEX idx_approval_requests_action_type ON approval_requests(action_type);
CREATE INDEX idx_approval_requests_expires_at ON approval_requests(expires_at);
CREATE INDEX idx_approval_requests_created_at ON approval_requests(created_at);

-- +goose StatementEnd