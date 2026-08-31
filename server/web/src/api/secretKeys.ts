import { apiFetch } from "./client";
import type { DeleteSecretKeyResult, GenerateSecretKeyResult, SecretKey } from "../types/secretKey";

interface ApprovalRequiredBody {
  approval_required: true;
  action_type: string;
  // Só populado por generate-secret: a chave em texto puro, já gerada (inativa) na hora da
  // solicitação — ver GenerateSecretKeyResult.
  plain_key?: string;
}

export async function listSecretKeys(applicationId: string): Promise<SecretKey[]> {
  const body = await apiFetch<{ success: boolean; secret_keys?: SecretKey[] }>(`/applications/${applicationId}/secret-keys`);
  return body.secret_keys ?? [];
}

interface GenerateSecretKeyBody {
  success: boolean;
  secret_key: SecretKey;
  plain_key: string;
  warning: string;
}

// "Gerar" é na real "regerar" — o servidor apaga toda chave existente da aplicação
// antes de criar uma nova (docs/rest-flow.md §8). plain_key só existe aqui.
export async function generateSecretKey(applicationId: string): Promise<GenerateSecretKeyResult> {
  const body = await apiFetch<GenerateSecretKeyBody | ApprovalRequiredBody>(`/applications/${applicationId}/generate-secret`, {
    method: "POST",
  });
  if ("approval_required" in body) {
    return { kind: "pending_approval", actionType: body.action_type, plainKey: body.plain_key };
  }
  return { kind: "generated", secretKey: body.secret_key, plainKey: body.plain_key, warning: body.warning };
}

export async function deleteSecretKey(id: string): Promise<DeleteSecretKeyResult> {
  const body = await apiFetch<{ success: boolean; message: string } | ApprovalRequiredBody>(`/secret-keys/${id}`, {
    method: "DELETE",
  });
  if ("approval_required" in body) {
    return { kind: "pending_approval", actionType: body.action_type };
  }
  return { kind: "deleted" };
}
