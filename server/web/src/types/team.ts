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
