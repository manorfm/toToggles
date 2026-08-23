// Espelha entity.ApprovalConfig (server/internal/app/domain/entity/approval_settings.go) — as
// 10 flags que existem no modelo. Nem todas têm efeito de verdade: ver
// lib/approvalActionTypes.ts sobre quais a middleware realmente infere e intercepta.
export interface ApprovalConfig {
  toggle_create: boolean;
  toggle_update: boolean;
  toggle_delete: boolean;
  toggle_enable: boolean;
  toggle_disable: boolean;
  toggle_rule: boolean;
  application_create: boolean;
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
