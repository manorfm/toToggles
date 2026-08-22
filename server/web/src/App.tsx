import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { AccountSecurityScreen } from "./screens/AccountSecurityScreen";
import { ApplicationsScreen } from "./screens/ApplicationsScreen";
import { ForcedPasswordChangeScreen } from "./screens/ForcedPasswordChangeScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { NotMigratedScreen } from "./screens/NotMigratedScreen";
import { TeamsScreen } from "./screens/TeamsScreen";

// Go serve este mesmo bundle (server/static/app/index.html) para todas as rotas
// não-API — o roteamento de fato acontece aqui no client. AppShell é a única
// guarda de sessão real (ver useCurrentUser); cada tela ainda não migrada do
// protótipo aparece como NotMigratedScreen até sair do design-graph.
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/change-password" element={<ForcedPasswordChangeScreen />} />
        <Route element={<AppShell />}>
          <Route path="/" element={<ApplicationsScreen />} />
          <Route path="/account/security" element={<AccountSecurityScreen />} />
          <Route path="/teams" element={<TeamsScreen />} />
          <Route path="/approvals" element={<NotMigratedScreen title="Approvals" />} />
          <Route path="/history" element={<NotMigratedScreen title="History" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
