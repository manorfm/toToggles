// Espelha entity.AuditLog (server/internal/app/domain/entity/audit_log.go) — GET /api/audit.
export type AuditCategory = "toggles" | "keys" | "access" | "approvals";

export interface AuditLogEntry {
  id: string;
  event_type: string;
  category: AuditCategory;
  text: string;
  target: string;
  team_id: string | null;
  actor_id: string;
  actor_name: string;
  created_at: string;
}

export interface AuditLogPage {
  data: AuditLogEntry[];
  next_cursor: string;
}
