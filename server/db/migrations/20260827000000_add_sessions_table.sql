-- +goose Up
-- +goose StatementBegin

-- Sessões de autenticação opacas (token bruto nunca é armazenado, só o hash SHA-256) —
-- substitui um esquema anterior sem tabela nenhuma, onde o "token" era só "token_"+userID
-- (sem assinatura, sem expiração, sem verificação real nenhuma).
CREATE TABLE sessions (
    id VARCHAR(26) PRIMARY KEY,
    token_hash VARCHAR(64) NOT NULL,
    user_id VARCHAR(26) NOT NULL,
    purpose VARCHAR(20) NOT NULL, -- 'auth' ou 'password_change'
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP INDEX IF EXISTS idx_sessions_expires_at;
DROP INDEX IF EXISTS idx_sessions_user_id;
DROP INDEX IF EXISTS idx_sessions_token_hash;
DROP TABLE IF EXISTS sessions;

-- +goose StatementEnd
