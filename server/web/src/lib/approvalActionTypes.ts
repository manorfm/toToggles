import type { ApprovalActionKey } from "../types/approvalSettings";

export interface ApprovalActionMeta {
  key: ApprovalActionKey;
  group: string;
  label: string;
  // false = a flag existe no modelo e pode ser ligada, mas a middleware que intercepta
  // mutações (getActionType, internal/app/middleware/approval.go) nunca a infere de uma
  // rota real, então ligá-la não tem efeito nenhum hoje.
  enforced: boolean;
  hint?: string;
}

// Ordem e agrupamento espelham entity.ApprovalConfig; labels/hints vêm de ler
// getActionType diretamente (não do protótipo — APPROVAL_ACTIONS lá é só texto de
// exemplo, sem os 10 valores reais). Confirmado: só toggle_create/toggle_update/
// toggle_delete/application_create/application_delete são de fato inferidos de uma
// rota HTTP; qualquer PUT em .../toggles/:id (enable, disable ou regra) sempre vira
// toggle_update, nunca toggle_enable/toggle_disable/toggle_rule.
export const APPROVAL_ACTIONS: ApprovalActionMeta[] = [
  { key: "toggle_create", group: "Toggles", label: "Create toggle", enforced: true },
  { key: "toggle_update", group: "Toggles", label: "Update toggle (enable, disable or rule change)", enforced: true },
  { key: "toggle_delete", group: "Toggles", label: "Delete toggle", enforced: true },
  {
    key: "toggle_enable",
    group: "Toggles",
    label: "Enable toggle",
    enforced: false,
    hint: "Not enforced separately — enabling a toggle is gated by \"Update toggle\" above.",
  },
  {
    key: "toggle_disable",
    group: "Toggles",
    label: "Disable toggle",
    enforced: false,
    hint: "Not enforced separately — disabling a toggle is gated by \"Update toggle\" above.",
  },
  {
    key: "toggle_rule",
    group: "Toggles",
    label: "Change activation rule",
    enforced: false,
    hint: "Not enforced separately — rule changes are gated by \"Update toggle\" above.",
  },
  { key: "application_create", group: "Applications", label: "Create or update application", enforced: true },
  { key: "application_delete", group: "Applications", label: "Delete application", enforced: true },
  {
    key: "secret_key_create",
    group: "Secret keys",
    label: "Generate secret key",
    enforced: false,
    hint: "Secret key endpoints don't go through the approval workflow yet — this flag has no effect.",
  },
  {
    key: "secret_key_delete",
    group: "Secret keys",
    label: "Delete secret key",
    enforced: false,
    hint: "Secret key endpoints don't go through the approval workflow yet — this flag has no effect.",
  },
];

export const APPROVAL_ACTION_GROUPS = Array.from(new Set(APPROVAL_ACTIONS.map((a) => a.group)));
