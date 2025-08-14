-- +goose Up
-- +goose StatementBegin

-- Tabela de usuários
CREATE TABLE users (
    id VARCHAR(26) PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de relacionamento usuário-aplicação (many-to-many)
CREATE TABLE user_applications (
    user_id VARCHAR(26) NOT NULL,
    application_id VARCHAR(26) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, application_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);

-- Tabela de secret keys
CREATE TABLE secret_keys (
    id VARCHAR(26) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(64) UNIQUE NOT NULL,
    application_id VARCHAR(26) NOT NULL,
    created_by VARCHAR(26) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Índices para performance
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_user_applications_user_id ON user_applications(user_id);
CREATE INDEX idx_user_applications_application_id ON user_applications(application_id);
CREATE INDEX idx_secret_keys_application_id ON secret_keys(application_id);
CREATE INDEX idx_secret_keys_created_by ON secret_keys(created_by);
CREATE INDEX idx_secret_keys_key_hash ON secret_keys(key_hash);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP INDEX IF EXISTS idx_secret_keys_key_hash;
DROP INDEX IF EXISTS idx_secret_keys_created_by;
DROP INDEX IF EXISTS idx_secret_keys_application_id;
DROP INDEX IF EXISTS idx_user_applications_application_id;
DROP INDEX IF EXISTS idx_user_applications_user_id;
DROP INDEX IF EXISTS idx_users_role;
DROP INDEX IF EXISTS idx_users_username;

DROP TABLE IF EXISTS secret_keys;
DROP TABLE IF EXISTS user_applications;
DROP TABLE IF EXISTS users;

-- +goose StatementEnd