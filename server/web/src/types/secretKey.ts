// Espelha entity.SecretKey (server/internal/app/domain/entity/secret_key.go) — key_hash nunca é
// serializado (json:"-"), então isso é só metadado, nunca a chave em si. is_current/last_used_at
// são novos (v2.6 §5.1/§5.6): até 2 chaves por aplicação podem estar vivas ao mesmo tempo durante
// uma janela de overlap de rotação (current + previous), e last_used_at é tracking real (não
// mock), atualizado a cada autenticação bem-sucedida via X-API-Key.
export interface SecretKey {
  id: string;
  name: string;
  application_id: string;
  created_by: string;
  is_current: boolean;
  last_used_at: string | null;
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
// plainKey em "pending_approval": quem pediu a chave recebe o valor em texto puro já na hora da
// solicitação (a chave existe no banco, só inativa — não autentica nada até ser aprovada). Sem
// isso o requester nunca teria como ver a chave, já que só ele vê esta resposta 202.
export type GenerateSecretKeyResult =
  | ({ kind: "generated" } & GeneratedSecretKey)
  | { kind: "pending_approval"; actionType: string; plainKey?: string };

export type DeleteSecretKeyResult = { kind: "deleted" } | { kind: "pending_approval"; actionType: string };
