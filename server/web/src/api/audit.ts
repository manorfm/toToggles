import { apiFetch } from "./client";
import type { AuditCategory, AuditLogPage } from "../types/audit";

// GET /api/audit?category=&cursor=&limit= — paginação infinita por cursor (nunca "página N",
// pedido explícito do usuário), filtro por categoria opcional. Ver docs/rest-flow.md §10.
export async function listAuditLog(options?: { category?: AuditCategory; cursor?: string; limit?: number }): Promise<AuditLogPage> {
  const params = new URLSearchParams();
  if (options?.category) params.set("category", options.category);
  if (options?.cursor) params.set("cursor", options.cursor);
  if (options?.limit) params.set("limit", String(options.limit));
  const query = params.toString();
  return apiFetch<AuditLogPage>(`/audit${query ? `?${query}` : ""}`);
}
