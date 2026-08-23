import { useState } from "react";
import { NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { logout } from "../api/profile";
import { Icon } from "./Icon";
import { UserMenu } from "./UserMenu";

// Destinos confirmados em get_component_spec("App").textos: "Applications",
// "Teams & people", "Approvals", "History". Cada um aponta pra uma tela real.
// "Teams & people" some para quem não é root: toda a API /teams exige
// RequireRoot(), mostrar o item pra outros só levaria a 403.
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
