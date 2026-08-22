import { ApiError, apiFetch } from "./client";
import type { AuthenticatedUser, LoginResult } from "../types/auth";

interface LoginResponseBody {
  success: boolean;
  error?: string;
  must_change_password?: boolean;
  user_id?: string;
  username?: string;
  user?: AuthenticatedUser;
}

export async function login(username: string, password: string): Promise<LoginResult> {
  const body = await apiFetch<LoginResponseBody>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

  if (body.must_change_password) {
    return { kind: "must_change_password", userId: body.user_id!, username: body.username! };
  }
  return { kind: "authenticated", user: body.user! };
}

export async function checkFirstAccess(): Promise<boolean> {
  try {
    const body = await apiFetch<{ first_access: boolean }>("/auth/check-first-access");
    return body.first_access;
  } catch {
    // Endpoint público, mas se falhar (rede, etc.) não bloqueia a tela de login.
    return false;
  }
}

export { ApiError };
