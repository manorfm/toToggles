// Espelha entity.SecretKey (server/internal/app/domain/entity/secret_key.go) — key_hash nunca é
// serializado (json:"-"), então isso é só metadado, nunca a chave em si.
export interface SecretKey {
  id: string;
  name: string;
  application_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// POST /applications/:id/generate-secret — "gerar" é na real "regerar": toda chave existente é
// apagada antes. plain_key só existe nesta resposta; não há como recuperá-la depois.
export interface GeneratedSecretKey {
  secretKey: SecretKey;
  plainKey: string;
  warning: string;
}
