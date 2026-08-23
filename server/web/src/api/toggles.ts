import { apiFetch } from "./client";
import type { CreateToggleResult, SetToggleEnabledResult, ToggleHierarchy, ToggleNode } from "../types/toggle";

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
