import { apiFetch } from "./client";
import type { Team, TeamWithCounts } from "../types/team";

export async function listTeams(): Promise<TeamWithCounts[]> {
  // GET /teams omite "teams" quando não há times (slice nil no Go) em vez de [].
  const body = await apiFetch<{ success: boolean; teams?: TeamWithCounts[] }>("/teams");
  return body.teams ?? [];
}

export interface CreateTeamInput {
  name: string;
  description?: string;
}

export async function createTeam(input: CreateTeamInput): Promise<Team> {
  const body = await apiFetch<{ success: boolean; team: Team }>("/teams", {
    method: "POST",
    body: JSON.stringify({ name: input.name, description: input.description ?? "" }),
  });
  return body.team;
}
