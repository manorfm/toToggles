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

// GET /profile/teams — times do próprio usuário, acessível pra qualquer role
// (diferente de GET /teams, que é RequireRoot()).
export async function listMyTeams(): Promise<Team[]> {
  const body = await apiFetch<{ success: boolean; teams?: Team[] }>("/profile/teams");
  return body.teams ?? [];
}

export interface TeamOption {
  id: string;
  name: string;
}

// Fonte de times pra um seletor (ex.: criar aplicação): root vê todos os times
// (GET /teams); qualquer outra role só vê os times de que já faz parte
// (GET /profile/teams) — POST /applications não valida isso no servidor, mas não
// faz sentido oferecer um team_id que o usuário nem consegue enxergar depois.
export async function listTeamOptions(isRoot: boolean): Promise<TeamOption[]> {
  const teams = isRoot ? await listTeams() : await listMyTeams();
  return teams.map((t) => ({ id: t.id, name: t.name }));
}
