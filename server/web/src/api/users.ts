import { apiFetch } from "./client";
import type { User } from "../types/user";

export async function listUsers(): Promise<User[]> {
  const body = await apiFetch<{ success: boolean; users?: User[] }>("/users");
  return body.users ?? [];
}
