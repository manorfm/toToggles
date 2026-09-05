import { apiFetch } from "./client";
import type { AuditActor, AuditCategory, AuditLogPage, AuditRange } from "../types/audit";

// GET /api/audit?category=&actor_id=&range=&cursor=&limit= — paginação infinita por cursor
// (nunca "página N"), filtros opcionais (v2.6 §7 acrescentou actorId/range a category). Ver
// docs/rest-flow.md §10.
export async function listAuditLog(options?: {
  category?: AuditCategory;
  actorId?: string;
  range?: AuditRange;
  cursor?: string;
  limit?: number;
}): Promise<AuditLogPage> {
  const params = new URLSearchParams();
  if (options?.category) params.set("category", options.category);
  if (options?.actorId) params.set("actor_id", options.actorId);
  if (options?.range) params.set("range", options.range);
  if (options?.cursor) params.set("cursor", options.cursor);
  if (options?.limit) params.set("limit", String(options.limit));
  const query = params.toString();
  return apiFetch<AuditLogPage>(`/audit${query ? `?${query}` : ""}`);
}

// GET /api/audit/actors — mesma visibilidade por time de listAuditLog. "data" ausente (slice nil
// no Go) é tratado como lista vazia, mesmo cuidado já documentado noutros endpoints opcionais.
export async function listAuditActors(): Promise<AuditActor[]> {
  const body = await apiFetch<{ data?: AuditActor[] }>("/audit/actors");
  return body.data ?? [];
}

// GET /api/applications/:id/audit — Activity tab de UMA aplicação (v2.6 §7), visível pra
// qualquer usuário autenticado (sem escopo por time, diferente de listAuditLog).
export async function listApplicationAudit(
  applicationId: string,
  options?: { cursor?: string; limit?: number }
): Promise<AuditLogPage> {
  const params = new URLSearchParams();
  if (options?.cursor) params.set("cursor", options.cursor);
  if (options?.limit) params.set("limit", String(options.limit));
  const query = params.toString();
  return apiFetch<AuditLogPage>(`/applications/${applicationId}/audit${query ? `?${query}` : ""}`);
}
