import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ApplicationsScreen } from "./screens/ApplicationsScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { NotMigratedScreen } from "./screens/NotMigratedScreen";

// Go serve este mesmo bundle (server/static/app/index.html) para todas as rotas
// não-API — o roteamento de fato acontece aqui no client. AppShell é a única
// guarda de sessão real (ver useCurrentUser); cada tela ainda não migrada do
// protótipo aparece como NotMigratedScreen até sair do design-graph.
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/change-password" element={<NotMigratedScreen title="Troca de senha" fullScreen />} />
        <Route element={<AppShell />}>
          <Route path="/" element={<ApplicationsScreen />} />
          <Route path="/teams" element={<NotMigratedScreen title="Teams & people" />} />
          <Route path="/approvals" element={<NotMigratedScreen title="Approvals" />} />
          <Route path="/history" element={<NotMigratedScreen title="History" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
