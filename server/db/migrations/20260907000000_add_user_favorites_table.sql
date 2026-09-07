-- +goose Up
-- +goose StatementBegin

-- Favoritos passam a persistir no servidor, por usuário — antes era só localStorage (v2.6 §6.4),
-- o que perdia o favorito ao trocar de navegador/dispositivo e (a queixa que motivou esta
-- migração) fazia parecer que "sumia" nesse cenário. favorite_key é o mesmo formato opaco já
-- usado pelo frontend ("app:{id}"/"tg:{appId}:{path}") — o backend nunca interpreta o conteúdo.
CREATE TABLE user_favorites (
    id VARCHAR(26) PRIMARY KEY,
    user_id VARCHAR(26) NOT NULL,
    favorite_key VARCHAR(300) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_user_favorites_user_key ON user_favorites(user_id, favorite_key);
CREATE INDEX idx_user_favorites_user_id ON user_favorites(user_id);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS user_favorites;

-- +goose StatementEnd
