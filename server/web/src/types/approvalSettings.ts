// Espelha entity.ApprovalConfig (server/internal/app/domain/entity/approval_settings.go) — as
// 11 flags que existem no modelo. Nem todas têm efeito de verdade: ver
// lib/approvalActionTypes.ts sobre quais a middleware realmente infere e intercepta.
// application_update é first-class desde uma correção posterior (achada numa auditoria de status
// geral, docs/rest-flow.md §9.1): antes, `PUT /applications/:id` reusava application_create, então
// uma única flag controlava tanto criar quanto editar uma aplicação — sem como exigir aprovação
// pra um sem o outro.
export interface ApprovalConfig {
  toggle_create: boolean;
  toggle_update: boolean;
  toggle_delete: boolean;
  toggle_enable: boolean;
  toggle_disable: boolean;
  toggle_rule: boolean;
  application_create: boolean;
  application_update: boolean;
  application_delete: boolean;
  secret_key_create: boolean;
  secret_key_delete: boolean;
}

export type ApprovalActionKey = keyof ApprovalConfig;

// GET /approval/settings (root only) — docs/rest-flow.md §9.1.
export interface ApprovalSettings {
  id: string;
  approval_enabled: boolean;
  required_actions: ApprovalConfig;
  default_expiration_days: number;
  created_at: string;
  updated_at: string;
}

// PUT /approval/settings — patch parcial, MAS required_actions, quando presente, substitui o
// objeto inteiro (as 10 chaves de uma vez) — não dá pra enviar só uma chave.
export interface UpdateApprovalSettingsInput {
  approvalEnabled?: boolean;
  requiredActions?: ApprovalConfig;
  defaultExpirationDays?: number;
}
