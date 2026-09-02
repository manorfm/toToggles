import { apiFetch } from "./client";
import type { CreateUserInput, CreateUserResult, ResetPasswordResult, User } from "../types/user";

export async function listUsers(): Promise<User[]> {
  const body = await apiFetch<{ success: boolean; users?: User[] }>("/users");
  return body.users ?? [];
}

export async function createUser(input: CreateUserInput): Promise<CreateUserResult> {
  const body = await apiFetch<{ success: boolean; user: User; password: string; warning?: string }>("/users", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      username: input.username,
      role: input.role,
      team_id: input.teamId,
      is_approver: input.isApprover ?? false,
    }),
  });
  return { user: body.user, password: body.password, warning: body.warning };
}

export async function deleteUser(id: string): Promise<void> {
  await apiFetch<{ success: boolean; message: string }>(`/users/${id}`, { method: "DELETE" });
}

// POST /users/:id/reset-password (docs/rest-flow.md §3) — gera uma nova senha provisória e
// invalida a anterior; não existe (nem pode existir com segurança) um jeito de reler uma senha
// já mostrada, já que o servidor só guarda o hash bcrypt.
export async function resetUserPassword(id: string): Promise<ResetPasswordResult> {
  const body = await apiFetch<{ success: boolean; user: User; password: string }>(`/users/${id}/reset-password`, {
    method: "POST",
  });
  return { user: body.user, password: body.password };
}

// PUT /users/:id/status — desativa/reativa sem apagar a conta.
export async function setUserStatus(id: string, active: boolean): Promise<User> {
  const body = await apiFetch<{ success: boolean; user: User }>(`/users/${id}/status`, {
    method: "PUT",
    body: JSON.stringify({ active }),
  });
  return body.user;
}
