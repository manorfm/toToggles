import { useOutletContext } from "react-router-dom";
import type { AppShellContext, OpenAppInfo } from "./useAppUser";

// Deixa uma tela (hoje só ApplicationDetailScreen) informar o AppShell sobre a aplicação aberta
// — ver a nota em AppShellContext#setOpenApp.
export function useSetOpenApp(): (app: OpenAppInfo | null) => void {
  return useOutletContext<AppShellContext>().setOpenApp;
}
