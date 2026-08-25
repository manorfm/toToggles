import { useOutletContext } from "react-router-dom";
import type { AuthenticatedUser } from "../types/auth";

export interface AppShellContext {
  user: AuthenticatedUser;
  // Confirmado no protótipo real (app.jsx): o breadcrumb do topbar ganha um 3º nível com o nome
  // da aplicação aberta ("Applications / {app.name} / Toggles") — dado que só a própria tela de
  // detalhe tem (AppShell nunca carrega uma aplicação individual). Ver useSetBreadcrumbApp.
  setBreadcrumbApp: (name: string | null) => void;
}

// AppShell já resolveu a sessão (useCurrentUser) antes de renderizar seu Outlet
// — telas aninhadas usam este hook em vez de rebuscar GET /profile.
export function useAppUser(): AuthenticatedUser {
  return useOutletContext<AppShellContext>().user;
}
