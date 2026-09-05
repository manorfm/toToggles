import { useOutletContext } from "react-router-dom";
import type { AuthenticatedUser } from "../types/auth";

// Confirmado no app.jsx real: dentro de uma aplicação aberta, "toggles"/"keys" são as duas abas
// originais — trocadas via `setTab`, nunca duas visíveis ao mesmo tempo. "activity" (v2.6 §7) é
// uma 3ª aba nova: o design-graph não confirma esse posicionamento com precisão pra esta tela
// específica (ActivityView só aparece ligado à árvore de HistoryView, não à de detalhe de
// aplicação — buraco de cobertura conhecido pra telas dentro da árvore autenticada de App), então
// esta decisão foi tomada com o usuário diretamente em vez de adivinhada do protótipo.
export type ApplicationDetailTab = "toggles" | "keys" | "activity";

// Dados da aplicação aberta que só ApplicationDetailScreen tem (AppShell nunca busca uma
// aplicação individual) mas que o shell precisa pra três lugares confirmados no app.jsx real:
// o 3º nível do breadcrumb ("Applications / {app.name} / Toggles" ou ".../Service key"), a
// sub-navegação da sidebar (".nav-label" com o nome da app + itens "Toggles"/"Service key", que
// TROCAM a aba, não fazem scroll — ver AppShell.tsx) e o próprio breadcrumb (clicar no nome da
// app volta pra aba "Toggles", igual ao protótipo real).
export interface OpenAppInfo {
  name: string;
  toggleCount: number;
  hasSecretKey: boolean;
  tab: ApplicationDetailTab;
  onTabChange: (tab: ApplicationDetailTab) => void;
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
