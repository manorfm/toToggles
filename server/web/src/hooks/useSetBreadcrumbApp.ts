import { useOutletContext } from "react-router-dom";
import type { AppShellContext } from "./useAppUser";

// Deixa uma tela (hoje só ApplicationDetailScreen) informar o AppShell do nome pra mostrar como
// 3º nível do breadcrumb — ver a nota em AppShellContext#setBreadcrumbApp.
export function useSetBreadcrumbApp(): (name: string | null) => void {
  return useOutletContext<AppShellContext>().setBreadcrumbApp;
}
