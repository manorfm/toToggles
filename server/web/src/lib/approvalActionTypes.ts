import type { ApprovalActionKey } from "../types/approvalSettings";

export interface ApprovalActionMeta {
  key: ApprovalActionKey;
  group: string;
  label: string;
  // Todos os 10 tipos são de fato inferidos de uma rota real hoje (getActionType,
  // internal/app/middleware/approval.go) — toggle_enable/toggle_disable pelo valor de
  // `enabled` no endpoint recursivo singular, toggle_rule pela presença de
  // has_activation_rule/activation_rule no corpo do endpoint plural, e
  // secret_key_create/secret_key_delete porque as duas rotas de secret key agora passam
  // por RequireApprovalAware em vez de RequireAdmin() puro. Campo mantido (em vez de
  // removido) para o caso de uma rota nova no futuro precisar voltar a documentar uma
  // exceção aqui.
  enforced: boolean;
  hint?: string;
}

// Ordem e agrupamento espelham entity.ApprovalConfig; labels vêm de ler getActionType
// diretamente (não do protótipo — APPROVAL_ACTIONS lá é só texto de exemplo, sem os 10
// valores reais).
export const APPROVAL_ACTIONS: ApprovalActionMeta[] = [
  { key: "toggle_create", group: "Toggles", label: "Create toggle", enforced: true },
  { key: "toggle_update", group: "Toggles", label: "Update toggle (plain enable/disable of a single node)", enforced: true },
  { key: "toggle_delete", group: "Toggles", label: "Delete toggle", enforced: true },
  { key: "toggle_enable", group: "Toggles", label: "Enable toggle (recursive, whole subtree)", enforced: true },
  { key: "toggle_disable", group: "Toggles", label: "Disable toggle (recursive, whole subtree)", enforced: true },
  { key: "toggle_rule", group: "Toggles", label: "Change activation rule", enforced: true },
  { key: "application_create", group: "Applications", label: "Create or update application", enforced: true },
  { key: "application_delete", group: "Applications", label: "Delete application", enforced: true },
  { key: "secret_key_create", group: "Secret keys", label: "Generate secret key", enforced: true },
  { key: "secret_key_delete", group: "Secret keys", label: "Delete secret key", enforced: true },
];

export const APPROVAL_ACTION_GROUPS = Array.from(new Set(APPROVAL_ACTIONS.map((a) => a.group)));
