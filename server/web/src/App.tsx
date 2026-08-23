import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { AccountSecurityScreen } from "./screens/AccountSecurityScreen";
import { ApplicationDetailScreen } from "./screens/ApplicationDetailScreen";
import { ApplicationsScreen } from "./screens/ApplicationsScreen";
import { ApprovalsScreen } from "./screens/ApprovalsScreen";
import { ForcedPasswordChangeScreen } from "./screens/ForcedPasswordChangeScreen";
import { HistoryScreen } from "./screens/HistoryScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { TeamsScreen } from "./screens/TeamsScreen";
import { UserManagementScreen } from "./screens/UserManagementScreen";

// Go serve este mesmo bundle (server/static/app/index.html) para todas as rotas
// não-API — o roteamento de fato acontece aqui no client. AppShell é a única
// guarda de sessão real (ver useCurrentUser).
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/change-password" element={<ForcedPasswordChangeScreen />} />
        <Route element={<AppShell />}>
          <Route path="/" element={<ApplicationsScreen />} />
          <Route path="/applications/:id" element={<ApplicationDetailScreen />} />
          <Route path="/account/security" element={<AccountSecurityScreen />} />
          <Route path="/teams" element={<TeamsScreen />} />
          {/* "/user-management", não "/users": esse último é o prefixo real de API
              (GET/POST /users) e nunca receberia a casca do SPA num hard refresh. */}
          <Route path="/user-management" element={<UserManagementScreen />} />
          {/* Approvals + Approval Management são a MESMA tela com abas no protótipo
              (get_screen_full("ApprovalsView")) — "Configurar" só troca de aba, não navega. */}
          <Route path="/approvals" element={<ApprovalsScreen />} />
          <Route path="/history" element={<HistoryScreen />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
