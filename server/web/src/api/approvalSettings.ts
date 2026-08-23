import { apiFetch } from "./client";
import type { ApprovalSettings, UpdateApprovalSettingsInput } from "../types/approvalSettings";

export async function getApprovalSettings(): Promise<ApprovalSettings> {
  const body = await apiFetch<{ message: string; data: ApprovalSettings }>("/approval/settings");
  return body.data;
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
