import { apiFetch } from "./client";
import type { GeneratedSecretKey, SecretKey } from "../types/secretKey";

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
export async function generateSecretKey(applicationId: string): Promise<GeneratedSecretKey> {
  const body = await apiFetch<GenerateSecretKeyBody>(`/applications/${applicationId}/generate-secret`, { method: "POST" });
  return { secretKey: body.secret_key, plainKey: body.plain_key, warning: body.warning };
}

export async function deleteSecretKey(id: string): Promise<void> {
  await apiFetch<{ success: boolean; message: string }>(`/secret-keys/${id}`, { method: "DELETE" });
}
