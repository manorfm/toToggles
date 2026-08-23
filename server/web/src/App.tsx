import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { AccountSecurityScreen } from "./screens/AccountSecurityScreen";
import { ApplicationDetailScreen } from "./screens/ApplicationDetailScreen";
import { ApplicationsScreen } from "./screens/ApplicationsScreen";
import { ApprovalSettingsScreen } from "./screens/ApprovalSettingsScreen";
import { ApprovalsScreen } from "./screens/ApprovalsScreen";
import { ForcedPasswordChangeScreen } from "./screens/ForcedPasswordChangeScreen";
import { HistoryScreen } from "./screens/HistoryScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { TeamsScreen } from "./screens/TeamsScreen";

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
          <Route path="/approvals" element={<ApprovalsScreen />} />
          {/* "/approvals/settings" (plural), não "/approval/settings" (singular, prefixo real
              de API — colidiria com isAPIRoute e nunca receberia a casca do SPA num refresh). */}
          <Route path="/approvals/settings" element={<ApprovalSettingsScreen />} />
          <Route path="/history" element={<HistoryScreen />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
