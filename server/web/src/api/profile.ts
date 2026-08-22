import { apiFetch } from "./client";
import type { AuthenticatedUser } from "../types/auth";

export async function getCurrentUser(): Promise<AuthenticatedUser> {
  const body = await apiFetch<{ success: boolean; user: AuthenticatedUser }>("/profile");
  return body.user;
}

export async function logout(): Promise<void> {
  await apiFetch<{ success: boolean; message: string }>("/auth/logout", { method: "POST" });
}
