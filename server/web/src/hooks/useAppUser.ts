import { useOutletContext } from "react-router-dom";
import type { AuthenticatedUser } from "../types/auth";

interface AppShellContext {
  user: AuthenticatedUser;
}

// AppShell já resolveu a sessão (useCurrentUser) antes de renderizar seu Outlet
// — telas aninhadas usam este hook em vez de rebuscar GET /profile.
export function useAppUser(): AuthenticatedUser {
  return useOutletContext<AppShellContext>().user;
}
