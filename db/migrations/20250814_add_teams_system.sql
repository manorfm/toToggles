-- +goose Up
-- +goose StatementBegin

-- Tabela principal de times
CREATE TABLE teams (
    id VARCHAR(26) PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de relacionamento team-usuário (many-to-many)
CREATE TABLE team_users (
    team_id VARCHAR(26) NOT NULL,
    user_id VARCHAR(26) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (team_id, user_id),
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Tabela de relacionamento team-aplicação com permissões (many-to-many)
CREATE TABLE team_applications (
    team_id VARCHAR(26) NOT NULL,
    application_id VARCHAR(26) NOT NULL,
    permission VARCHAR(20) NOT NULL DEFAULT 'read',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (team_id, application_id),
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);

-- Índices para performance
CREATE INDEX idx_teams_name ON teams(name);
CREATE INDEX idx_team_users_team_id ON team_users(team_id);
CREATE INDEX idx_team_users_user_id ON team_users(user_id);
CREATE INDEX idx_team_applications_team_id ON team_applications(team_id);
CREATE INDEX idx_team_applications_application_id ON team_applications(application_id);
CREATE INDEX idx_team_applications_permission ON team_applications(permission);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- Remover índices
DROP INDEX IF EXISTS idx_team_applications_permission;
DROP INDEX IF EXISTS idx_team_applications_application_id;
DROP INDEX IF EXISTS idx_team_applications_team_id;
DROP INDEX IF EXISTS idx_team_users_user_id;
DROP INDEX IF EXISTS idx_team_users_team_id;
DROP INDEX IF EXISTS idx_teams_name;

-- Remover tabelas
DROP TABLE IF EXISTS team_applications;
DROP TABLE IF EXISTS team_users;
DROP TABLE IF EXISTS teams;

-- +goose StatementEnd