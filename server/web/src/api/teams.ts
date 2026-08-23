import { apiFetch } from "./client";
import type { Team, TeamWithCounts } from "../types/team";
import type { User } from "../types/user";

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

// DELETE /teams/:id — root only, não é approval-aware (não faz parte da lista de
// action_type do workflow de aprovação, ver docs/rest-flow.md §"Route protection").
export async function deleteTeam(id: string): Promise<void> {
  await apiFetch<{ success: boolean; message: string }>(`/teams/${id}`, { method: "DELETE" });
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

export async function listTeamMembers(teamId: string): Promise<User[]> {
  const body = await apiFetch<{ success: boolean; users?: User[] }>(`/teams/${teamId}/users`);
  return body.users ?? [];
}

export async function addTeamMember(teamId: string, userId: string): Promise<void> {
  await apiFetch<{ success: boolean; message: string }>(`/teams/${teamId}/users`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });
}

export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  await apiFetch<{ success: boolean; message: string }>(`/teams/${teamId}/users/${userId}`, { method: "DELETE" });
}
