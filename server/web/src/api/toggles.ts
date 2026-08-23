import { apiFetch } from "./client";
import type {
  CreateToggleResult,
  DeleteToggleResult,
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

// DELETE /applications/:id/toggles/:toggleId (plural — NÃO recursivo). Chamar só quando o
// toggle não tem filhos (ver DeleteToggleResult) — a UI garante isso antes de chegar aqui.
export async function deleteToggle(applicationId: string, toggleId: string): Promise<DeleteToggleResult> {
  const body = await apiFetch<{ message: string } | ApprovalRequiredBody>(`/applications/${applicationId}/toggles/${toggleId}`, {
    method: "DELETE",
  });
  if ("approval_required" in body) {
    return { kind: "pending_approval", actionType: body.action_type };
  }
  return { kind: "deleted" };
}
