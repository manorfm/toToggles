import { apiFetch } from "./client";
import type { ApprovalRequest } from "../types/approval";

// GET /approval/requests — qualquer status (pending/approved/rejected/expired),
// acessível pra qualquer role autenticada (sem RequireRoot/RequireAdmin no servidor).
// Usado pela tela de History como o log de auditoria disponível de verdade — o
// protótipo mostra "todo evento do sistema", mas o backend só registra o que passou
// pelo workflow de aprovação.
export async function listAllApprovals(): Promise<ApprovalRequest[]> {
  const body = await apiFetch<{ message: string; data?: ApprovalRequest[] }>("/approval/requests");
  return body.data ?? [];
}

export async function listPendingApprovals(): Promise<ApprovalRequest[]> {
  const body = await apiFetch<{ message: string; data?: ApprovalRequest[] }>("/approval/requests/pending");
  return body.data ?? [];
}

export async function listApprovableApprovals(): Promise<ApprovalRequest[]> {
  const body = await apiFetch<{ message: string; data?: ApprovalRequest[] }>("/approval/requests/approvable");
  return body.data ?? [];
}

// GET /approval/requests/my — requested_by = usuário atual, qualquer role. Fonte da aba
// "Mine" na tela unificada de Approvals (get_screen_full("ApprovalsView")).
export async function listMyApprovals(): Promise<ApprovalRequest[]> {
  const body = await apiFetch<{ message: string; data?: ApprovalRequest[] }>("/approval/requests/my");
  return body.data ?? [];
}

export async function executeApproval(id: string): Promise<void> {
  await apiFetch<{ message: string }>(`/approval/requests/${id}/execute`, { method: "POST" });
}

export async function approveApproval(id: string): Promise<void> {
  await apiFetch<{ message: string }>(`/approval/requests/${id}/approve`, { method: "POST" });
}

// A API separa aprovar de executar de propósito (docs/rest-flow.md §9.2: "nothing in
// the API auto-executes a request the moment it is approved") — o cliente é quem
// decide encadear os dois. Se approve() falhar, execute() nunca roda. O chamador que
// precisar distinguir qual passo falhou (pra oferecer um retry só do execute) deve
// usar approveApproval()/executeApproval() direto em vez desta função combinada.
export async function approveAndExecuteApproval(id: string): Promise<void> {
  await approveApproval(id);
  await executeApproval(id);
}

export async function rejectApproval(id: string, reason?: string): Promise<void> {
  await apiFetch<{ message: string }>(`/approval/requests/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason: reason ?? "" }),
  });
}
