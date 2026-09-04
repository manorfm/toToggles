import { apiFetch } from "./client";
import type { ApprovalActionKey, ApprovalSettings, UpdateApprovalSettingsInput } from "../types/approvalSettings";

export async function getApprovalSettings(): Promise<ApprovalSettings> {
  const body = await apiFetch<{ message: string; data: ApprovalSettings }>("/approval/settings");
  return body.data;
}

// GET /approval/required?action_type=X — diferente de getApprovalSettings acima, NÃO é
// root-gated (docs/rest-flow.md §9.1/§9.2): qualquer role autenticada pode checar se uma
// ação específica exige aprovação. É o que sustenta o intercept pré-envio
// (hooks/useApprovalIntercept.ts) sem precisar de um novo endpoint ou de afrouxar o
// acesso a getApprovalSettings.
export async function checkApprovalRequired(actionType: ApprovalActionKey): Promise<boolean> {
  const body = await apiFetch<{ message: string; data: { action_type: string; required: boolean } }>(
    `/approval/required?action_type=${actionType}`
  );
  return body.data.required;
}

// required_actions é enviado por inteiro quando presente (docs/rest-flow.md §9.1: "set
// wholesale") — o caller monta o ApprovalConfig completo antes de chamar isto.
export async function updateApprovalSettings(input: UpdateApprovalSettingsInput): Promise<ApprovalSettings> {
  const body = await apiFetch<{ message: string; data: ApprovalSettings }>("/approval/settings", {
    method: "PUT",
    body: JSON.stringify({
      ...(input.approvalEnabled !== undefined ? { approval_enabled: input.approvalEnabled } : {}),
      ...(input.requiredActions ? { required_actions: input.requiredActions } : {}),
      ...(input.defaultExpirationDays !== undefined ? { default_expiration_days: input.defaultExpirationDays } : {}),
    }),
  });
  return body.data;
}
