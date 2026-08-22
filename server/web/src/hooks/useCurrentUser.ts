import { useEffect, useState } from "react";
import { getCurrentUser } from "../api/profile";
import { ApiError } from "../api/client";
import type { AuthenticatedUser } from "../types/auth";

export type CurrentUserState =
  | { status: "loading" }
  | { status: "authenticated"; user: AuthenticatedUser }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

// Guarda de autenticação client-side: GET /profile é a única fonte de verdade
// sobre a sessão. Necessário porque o middleware ServeStatic serve a casca do
// SPA para "/" sem checar sessão antes do ValidateToken() da rota rodar (ver
// server/CLAUDE.md) — o servidor nunca redireciona "/" sozinho na prática.
export function useCurrentUser(): CurrentUserState {
  const [state, setState] = useState<CurrentUserState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    getCurrentUser()
      .then((user) => {
        if (!cancelled) setState({ status: "authenticated", user });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setState({ status: "unauthenticated" });
          return;
        }
        const message = err instanceof ApiError ? err.message : "Não foi possível verificar sua sessão.";
        setState({ status: "error", message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
