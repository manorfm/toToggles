// Espelha entity.Team / entity.TeamWithCounts (server/internal/app/domain/entity/team.go).
export interface Team {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface TeamWithCounts extends Team {
  user_count: number;
  application_count: number;
}

// GET/POST /teams/:id/approvers (docs/rest-flow.md §9.3) — shape do join team_users, uma
// linha por membro do time (não só os aprovadores atuais). Só admin/root podem ser
// designados aprovadores, e só quando o workflow de aprovação está habilitado.
export interface TeamApprover {
  team_id: string;
  user_id: string;
  is_approver: boolean;
  username: string;
  role: "root" | "admin" | "user";
}
