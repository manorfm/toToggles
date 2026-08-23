import { apiFetch } from "./client";
import type { Team, TeamApprover, TeamWithCounts } from "../types/team";

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

export async function addTeamMember(teamId: string, userId: string): Promise<void> {
  await apiFetch<{ success: boolean; message: string }>(`/teams/${teamId}/users`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });
}

export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  await apiFetch<{ success: boolean; message: string }>(`/teams/${teamId}/users/${userId}`, { method: "DELETE" });
}

// GET /teams/:id/approvers — todo membro do time, não só os aprovadores atuais
// (docs/rest-flow.md §9.3); usado como fonte de dados de TeamMembersSection porque já
// traz is_approver junto (GET /teams/:id/users não traz).
export async function listTeamApprovers(teamId: string): Promise<TeamApprover[]> {
  const body = await apiFetch<{ message: string; data?: TeamApprover[] }>(`/teams/${teamId}/approvers`);
  return body.data ?? [];
}

// POST /teams/:id/approvers/:userId — root only (checado no usecase, não na rota).
// Exige o workflow de aprovação habilitado e que o alvo já seja admin/root no time;
// erros vêm como texto livre do usecase (ex.: "approval system must be enabled"),
// propagados via ApiError pra UI mostrar a mensagem real do servidor.
export async function setTeamApprover(teamId: string, userId: string, isApprover: boolean): Promise<TeamApprover[]> {
  const body = await apiFetch<{ data: TeamApprover[] }>(`/teams/${teamId}/approvers/${userId}`, {
    method: "POST",
    body: JSON.stringify({ is_approver: isApprover }),
  });
  return body.data;
}
