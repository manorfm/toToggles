import { apiFetch } from "./client";
import type { CreateUserResult, User, UserRole } from "../types/user";

export async function listUsers(): Promise<User[]> {
  const body = await apiFetch<{ success: boolean; users?: User[] }>("/users");
  return body.users ?? [];
}

export interface CreateUserInput {
  username: string;
  // "root" é rejeitado pela API na criação (docs/rest-flow.md §3) — só existe via
  // PUT /users/:id, e só quando o próprio root está editando a própria conta.
  role: "admin" | "user";
}

export async function createUser(input: CreateUserInput): Promise<CreateUserResult> {
  const body = await apiFetch<{ success: boolean; user: User; password: string }>("/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return { user: body.user, password: body.password };
}

export async function deleteUser(id: string): Promise<void> {
  await apiFetch<{ success: boolean; message: string }>(`/users/${id}`, { method: "DELETE" });
}

export async function updateUserRole(id: string, role: UserRole): Promise<User> {
  const body = await apiFetch<{ success: boolean; message: string; user: User; team_warnings?: string[] }>(`/users/${id}`, {
    method: "PUT",
    body: JSON.stringify({ role }),
  });
  return body.user;
}
