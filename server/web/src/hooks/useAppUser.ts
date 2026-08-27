import { useOutletContext } from "react-router-dom";
import type { AuthenticatedUser } from "../types/auth";

// Dados da aplicação aberta que só ApplicationDetailScreen tem (AppShell nunca busca uma
// aplicação individual) mas que o shell precisa pra dois lugares confirmados no app.jsx real:
// o 3º nível do breadcrumb ("Applications / {app.name} / Toggles") e a sub-navegação da sidebar
// (".nav-label" com o nome da app + itens "Toggles"/"Service key", ver AppShell.tsx).
export interface OpenAppInfo {
  name: string;
  toggleCount: number;
  hasSecretKey: boolean;
}

export interface AppShellContext {
  user: AuthenticatedUser;
  setOpenApp: (app: OpenAppInfo | null) => void;
}

// AppShell já resolveu a sessão (useCurrentUser) antes de renderizar seu Outlet
// — telas aninhadas usam este hook em vez de rebuscar GET /profile.
export function useAppUser(): AuthenticatedUser {
  return useOutletContext<AppShellContext>().user;
}
