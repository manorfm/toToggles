// Espelha entity.AuditLog (server/internal/app/domain/entity/audit_log.go) — GET /api/audit.
export type AuditCategory = "toggles" | "keys" | "access" | "approvals";

// v2.6 §7: os 3 chips de intervalo do AuditToolbar — "All time" não manda `range` nenhum.
export type AuditRange = "24h" | "7d" | "30d";

export interface AuditLogEntry {
  id: string;
  event_type: string;
  category: AuditCategory;
  text: string;
  target: string;
  team_id: string | null;
  // application_id/before/after (v2.6 §7): application_id alimenta a Activity tab; before/after
  // só existem no evento toggle_rule_set, `null` em todo o resto.
  application_id: string | null;
  before: string | null;
  after: string | null;
  actor_id: string;
  actor_name: string;
  created_at: string;
}

export interface AuditLogPage {
  data: AuditLogEntry[];
  next_cursor: string;
}

// GET /api/audit/actors — alimenta o `<select>` de filtro por ator do AuditToolbar.
export interface AuditActor {
  id: string;
  name: string;
}
