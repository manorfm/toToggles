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

// POST /applications é approval-aware (docs/rest-flow.md §1 "Route protection"): se o workflow de
// aprovação estiver ativo pra esse tipo de ação, a API responde 202 com {approval_required:true}
// em vez de criar de fato — o create só acontece depois, via POST /approval/requests/:id/execute.
export type CreateApplicationResult =
  | { kind: "created"; application: Application }
  | { kind: "pending_approval"; actionType: string };
