-- +goose Up
-- +goose StatementBegin

-- Rotação de secret key com janela de overlap (v2.6 §5.1): regenerar uma chave deixa de apagar a
-- anterior na hora — a antiga vira "previous" (is_current=false) e continua autenticando até ser
-- revogada explicitamente ou até uma PRÓXIMA rotação a substituir (só há espaço pra 1 previous por
-- vez, ver SecretKeyUseCase.rotateExistingKeys). revoked_at marca revogação explícita/definitiva
-- (Active sozinho não bastava: já era usado pra "ainda pendente de aprovação", um estado
-- diferente de "foi revogada de vez").
-- last_used_at (v2.6 §5.6): tracking real de uso, atualizado a cada ValidateSecretKey bem
-- sucedido (rota pública já quente) — decisão de ir além do protótipo, que só mostra um rótulo
-- fixo "(demo — not tracked)".
ALTER TABLE secret_keys ADD COLUMN is_current BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE secret_keys ADD COLUMN revoked_at DATETIME;
ALTER TABLE secret_keys ADD COLUMN last_used_at DATETIME;
CREATE INDEX idx_secret_keys_app_current ON secret_keys(application_id, is_current, revoked_at);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP INDEX idx_secret_keys_app_current;
ALTER TABLE secret_keys DROP COLUMN last_used_at;
ALTER TABLE secret_keys DROP COLUMN revoked_at;
ALTER TABLE secret_keys DROP COLUMN is_current;

-- +goose StatementEnd
