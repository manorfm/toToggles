import { useEffect, useState } from "react";
import { NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { listApprovableApprovals, listPendingApprovals } from "../api/approvals";
import { logout } from "../api/profile";
import { Icon } from "./Icon";
import { UserMenu } from "./UserMenu";

// Destinos confirmados em get_component_spec("App").textos: "Applications",
// "Teams & people", "Approvals" (com badge de {pendingApprovals}), "History". "Teams & people"
// some para quem não é root: a API por trás (/teams) exige RequireRoot(), mostrar o item pra
// outros só levaria a 403.
//
// "Approval Management" NÃO é um segundo item de nav — get_screen_full("ApprovalsView") revela
// que "Configurar" só troca de aba (pending/mine/settings) dentro da MESMA tela de Approvals,
// nunca navega pra outro lugar. A aba "Settings" já é escondida internamente pra quem não é
// root (screens/ApprovalsScreen.tsx), então um único item "Approvals" cobre os dois destinos.
//
// "Users" (User Management) FOI um item de nav aqui numa fase anterior, mas nenhum texto
// confirmado de App menciona isso — removido da sidebar (a tela continua existindo, só não
// é mais destino de navegação principal — ver App.tsx, rota /user-management).
const NAV_ITEMS: { to: string; label: string; end?: boolean; rootOnly?: boolean }[] = [
  { to: "/", label: "Applications", end: true },
  { to: "/teams", label: "Teams & people", rootOnly: true },
  { to: "/approvals", label: "Approvals" },
  { to: "/history", label: "History" },
];

// Casca autenticada do app (sidebar + guarda de sessão). Client-side porque o
// server nunca gate-keeps "/" de fato — ver a nota em useCurrentUser.
export function AppShell() {
  const currentUser = useCurrentUser();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const authenticatedUserId = currentUser.status === "authenticated" ? currentUser.user.id : null;
  const authenticatedUserIsRoot = currentUser.status === "authenticated" && currentUser.user.role === "root";

  useEffect(() => {
    if (!authenticatedUserId) return;
    let cancelled = false;
    const fetcher = authenticatedUserIsRoot ? listPendingApprovals : listApprovableApprovals;
    fetcher()
      .then((requests) => {
        if (!cancelled) setPendingCount(requests.length);
      })
      .catch(() => {
        // Contagem do badge é informativa, não crítica — falhar aqui não deve travar o shell.
      });
    return () => {
      cancelled = true;
    };
  }, [authenticatedUserId, authenticatedUserIsRoot]);

  if (currentUser.status === "loading") {
    return <div className="empty">Carregando…</div>;
  }
  if (currentUser.status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }
  if (currentUser.status === "error") {
    return <div className="empty">{currentUser.message}</div>;
  }

  const { user } = currentUser;

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app">
      <div className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Icon name="toggle" size={18} />
          </div>
          <div className="brand-name">toToggle</div>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {NAV_ITEMS.filter((item) => !item.rootOnly || user.role === "root").map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}>
              {item.label}
              {item.to === "/approvals" && pendingCount > 0 && (
                <span className="badge on" style={{ marginLeft: "auto" }}>
                  {pendingCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot" style={{ position: "relative" }}>
          <button className="nav-item" onClick={() => setMenuOpen((open) => !open)}>
            {user.username}
          </button>
          {menuOpen && (
            <UserMenu
              user={user}
              onClose={() => setMenuOpen(false)}
              onChangePassword={() => {
                setMenuOpen(false);
                navigate("/account/security");
              }}
              onLogout={handleLogout}
            />
          )}
        </div>
      </div>

      <main className="main">
        <Outlet context={{ user }} />
      </main>
    </div>
  );
}
