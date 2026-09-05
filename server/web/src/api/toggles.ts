import { apiFetch } from "./client";
import type {
  ArchivedToggle,
  BulkUpdateEnabledResult,
  CreateToggleResult,
  DeleteToggleResult,
  RestoreToggleResult,
  SetToggleEnabledResult,
  ToggleDetail,
  ToggleHierarchy,
  ToggleNode,
  UpdateToggleInput,
  UpdateToggleResult,
} from "../types/toggle";

interface ApprovalRequiredBody {
  approval_required: true;
  action_type: string;
}

export async function getToggleHierarchy(applicationId: string): Promise<ToggleNode[]> {
  const body = await apiFetch<ToggleHierarchy>(`/applications/${applicationId}/toggles?hierarchy=true`);
  return body.toggles ?? [];
}

// GET .../toggles (sem ?hierarchy=true) — bare array de entity.Toggle "crus": own enabled (não
// cascateado) + has_activation_rule, que a árvore hierárquica não carrega. Ver
// lib/toggleLeaves.ts#flattenToLeaves, que funde este resultado com getToggleHierarchy.
export async function getTogglesFlat(applicationId: string): Promise<ToggleDetail[]> {
  return apiFetch<ToggleDetail[]>(`/applications/${applicationId}/toggles`);
}

interface CreateToggleBody {
  message: string;
  path: string;
  enabled: boolean;
}

export async function createToggle(applicationId: string, path: string): Promise<CreateToggleResult> {
  const body = await apiFetch<CreateToggleBody | ApprovalRequiredBody>(`/applications/${applicationId}/toggles`, {
    method: "POST",
    body: JSON.stringify({ toggle: path }),
  });
  if ("approval_required" in body) {
    return { kind: "pending_approval", actionType: body.action_type };
  }
  return { kind: "created", path: body.path, enabled: body.enabled };
}

// PUT /applications/:id/toggle/:toggleId (singular "toggle") — recursivo: liga/desliga o nó e
// toda a subárvore descendente em uma chamada só.
export async function setToggleEnabled(
  applicationId: string,
  toggleId: string,
  enabled: boolean
): Promise<SetToggleEnabledResult> {
  const body = await apiFetch<{ id: string } | ApprovalRequiredBody>(
    `/applications/${applicationId}/toggle/${toggleId}`,
    { method: "PUT", body: JSON.stringify({ enabled }) }
  );
  if ("approval_required" in body) {
    return { kind: "pending_approval", actionType: body.action_type };
  }
  return { kind: "updated" };
}

export async function getToggle(applicationId: string, toggleId: string): Promise<ToggleDetail> {
  return apiFetch<ToggleDetail>(`/applications/${applicationId}/toggles/${toggleId}`);
}

// PUT /applications/:id/toggles/:toggleId (plural — NÃO recursivo, diferente de
// setToggleEnabled): substitui enabled + regra de ativação só deste nó.
export async function updateToggleRule(
  applicationId: string,
  toggleId: string,
  input: UpdateToggleInput
): Promise<UpdateToggleResult> {
  const body = await apiFetch<ToggleDetail | ApprovalRequiredBody>(`/applications/${applicationId}/toggles/${toggleId}`, {
    method: "PUT",
    body: JSON.stringify({
      enabled: input.enabled,
      has_activation_rule: input.hasActivationRule,
      ...(input.hasActivationRule ? { activation_rule: input.activationRule } : {}),
    }),
  });
  if ("approval_required" in body) {
    return { kind: "pending_approval", actionType: body.action_type };
  }
  return { kind: "updated", toggle: body };
}

// DELETE /applications/:id/toggles/:toggleId (plural) — recursivo e reversível (v2.6 §3.4/4.1):
// apaga o nó e toda a subárvore descendente num soft-delete só (ver RestoreToggleResult/
// restoreToggle abaixo pra desfazer).
export async function deleteToggle(applicationId: string, toggleId: string): Promise<DeleteToggleResult> {
  const body = await apiFetch<{ message: string } | ApprovalRequiredBody>(`/applications/${applicationId}/toggles/${toggleId}`, {
    method: "DELETE",
  });
  if ("approval_required" in body) {
    return { kind: "pending_approval", actionType: body.action_type };
  }
  return { kind: "deleted" };
}

// POST .../toggles/:toggleId/restore — desfaz um delete (o nó e a subárvore inteira voltam).
export async function restoreToggle(applicationId: string, toggleId: string): Promise<RestoreToggleResult> {
  await apiFetch<{ message: string; id: string }>(`/applications/${applicationId}/toggles/${toggleId}/restore`, {
    method: "POST",
  });
  return { kind: "restored" };
}

// PUT .../toggles/bulk (v2.6 §6.5) — liga/desliga o bit PRÓPRIO de várias folhas de uma vez,
// nunca recursivo. Reusa toggle_enable/toggle_disable como action type (mesma chave de
// configuração de aprovação do enable/disable recursivo).
export async function bulkUpdateEnabled(
  applicationId: string,
  toggleIds: string[],
  enabled: boolean
): Promise<BulkUpdateEnabledResult> {
  const body = await apiFetch<{ message: string } | ApprovalRequiredBody>(`/applications/${applicationId}/toggles/bulk`, {
    method: "PUT",
    body: JSON.stringify({ toggle_ids: toggleIds, enabled }),
  });
  if ("approval_required" in body) {
    return { kind: "pending_approval", actionType: body.action_type };
  }
  return { kind: "updated" };
}

interface ArchivedToggleBody {
  id: string;
  path: string;
  deleted_at: string;
  deleted_by_name: string;
}

// GET .../toggles/archived — uma raiz de arquivamento por operação de delete, mais recente
// primeiro (v2.6 §4.1). Slice nil no Go não serializa como `[]` — trata "toggles" ausente como
// lista vazia, mesmo cuidado já documentado noutros endpoints opcionais deste backend.
export async function getArchivedToggles(applicationId: string): Promise<ArchivedToggle[]> {
  const body = await apiFetch<{ message: string; toggles?: ArchivedToggleBody[] }>(`/applications/${applicationId}/toggles/archived`);
  return (body.toggles ?? []).map((t) => ({ id: t.id, path: t.path, deletedAt: t.deleted_at, deletedByName: t.deleted_by_name }));
}
