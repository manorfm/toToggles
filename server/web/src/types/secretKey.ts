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

// generate-secret e DELETE /secret-keys/:id são approval-aware (docs/rest-flow.md §9.1) — mesmo
// formato { kind: "pending_approval", actionType } usado por api/toggles.ts/api/applications.ts.
export type GenerateSecretKeyResult =
  | ({ kind: "generated" } & GeneratedSecretKey)
  | { kind: "pending_approval"; actionType: string };

export type DeleteSecretKeyResult = { kind: "deleted" } | { kind: "pending_approval"; actionType: string };
