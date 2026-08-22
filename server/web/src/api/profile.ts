import { apiFetch } from "./client";
import type { AuthenticatedUser } from "../types/auth";

export async function getCurrentUser(): Promise<AuthenticatedUser> {
  const body = await apiFetch<{ success: boolean; user: AuthenticatedUser }>("/profile");
  return body.user;
}

export async function logout(): Promise<void> {
  await apiFetch<{ success: boolean; message: string }>("/auth/logout", { method: "POST" });
}

export interface ChangeOwnPasswordInput {
  currentPassword: string;
  newPassword: string;
}

// POST /profile/change-password — troca voluntária, com sessão já válida.
export async function changeOwnPassword(input: ChangeOwnPasswordInput): Promise<void> {
  await apiFetch<{ success: boolean; message: string }>("/profile/change-password", {
    method: "POST",
    body: JSON.stringify({ current_password: input.currentPassword, new_password: input.newPassword }),
  });
}
