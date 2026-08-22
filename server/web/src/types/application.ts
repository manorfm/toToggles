// Espelha entity.ApplicationWithCounts (server/internal/app/domain/entity/application.go) —
// GET /applications não traz time/secret-key, só contagens (docs/rest-flow.md §6).
export interface Application {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  toggles_total: number;
  toggles_enabled: number;
  toggles_disabled: number;
}
