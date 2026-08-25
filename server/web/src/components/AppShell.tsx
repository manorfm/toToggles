import { useEffect, useState } from "react";
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { listApplications } from "../api/applications";
import { listApprovableApprovals, listPendingApprovals } from "../api/approvals";
import { listTeams } from "../api/teams";
import { listUsers } from "../api/users";
import { logout } from "../api/profile";
import { Icon, type IconName } from "./Icon";
import { RoleBadge } from "./RoleBadge";
import { UserMenu } from "./UserMenu";

// Destinos, ícones e contadores confirmados lendo o app.jsx REAL do protótipo — não o que
// design-graph indexa (que só expõe o branch de login de App, nunca a árvore autenticada).
// docs/toToggle.html embute um bundle comprimido (gzip+base64) por arquivo-fonte, keyed por
// UUID, dentro de um <script type="__bundler/manifest">; decodificado uma vez para confirmar
// isto (ver o comentário maior em lib/toggleLeaves.ts para o mesmo achado aplicado à árvore de
// toggles). Confirmado no app.jsx real:
//   <button onClick={...}><Icon name="apps" size={17}/> Applications <span className="count">{apps.length}</span></button>
//   <button onClick={...}><Icon name="users" size={17}/> Teams & people <span className="count">{teams.length}</span></button>
//   {showApprovalsNav && <button>...Approvals {pendingApprovals>0 && <span className="count">{pendingApprovals}</span>}</button>}
//   <button>...History</button>  {/* sem contador */}
// Applications/Teams mostram a contagem SEMPRE (mesmo "0"); só Approvals é condicional.
// "Teams & people" some para quem não é root: a API por trás (/teams) exige RequireRoot().
//
// "Approval Management" NÃO é um segundo item de nav — a própria ApprovalsView usa esse texto
// como título de página (page-title/breadcrumb), mas o item da sidebar continua "Approvals";
// "Configurar" só troca de aba dentro da mesma tela, nunca navega.
//
// "Usuários" (User Management) FOI removido do menu numa fase anterior por não ter texto
// confirmado no protótipo — o protótipo foi atualizado depois e agora tem uma tela de usuários
// de verdade (UsersView/UserModal/TempPasswordModal/StatusPill), com este item de nav
// confirmado: `{canManageUsers && <button>...<Icon name="user" size={17}/> Usuários
// <span className="count">{users.length}</span></button>}`, `canManageUsers =
// role === "root" || role === "admin"`. "Guia de início" continua de fora: é confirmado (ícone
// "rocket", abre um OnboardingModal de 7 passos) mas mapeia pra uma feature inteira ainda não
// construída nesta reescrita — adicionar o item de nav sem destino real seria um clique morto.
const NAV_ITEMS: { to: string; label: string; end?: boolean; rootOnly?: boolean; adminOrRoot?: boolean; icon: IconName; alwaysShowCount?: boolean }[] = [
  { to: "/", label: "Applications", end: true, icon: "apps", alwaysShowCount: true },
  { to: "/teams", label: "Teams & people", rootOnly: true, icon: "users", alwaysShowCount: true },
  { to: "/users", label: "Usuários", adminOrRoot: true, icon: "user", alwaysShowCount: true },
  { to: "/approvals", label: "Approvals", icon: "check" },
  { to: "/history", label: "History", icon: "clock" },
];

// Breadcrumb no topo do conteúdo — confirmado no app.jsx real como uma trilha
// (.crumbs > .c.link "Applications" sempre clicável + .sep "/" + .c.now por seção), não um
// rótulo único. Reconstrução fiel ao confirmado; a versão real também mostra um 3º nível com o
// nome da aplicação aberta ("Applications / {app.name} / Toggles") — omitido aqui porque
// AppShell não carrega dados de aplicação individual (isso vive em ApplicationDetailScreen);
// ver server/CLAUDE.md para esse gap registrado.
function Crumbs({ pathname, onHome }: { pathname: string; onHome: () => void }) {
  const now = pathname.startsWith("/teams")
    ? "Teams & people"
    : pathname.startsWith("/users")
      ? "Usuários"
      : pathname.startsWith("/approvals")
        ? "Approval Management"
        : pathname.startsWith("/history")
          ? "History"
          : pathname.startsWith("/account")
            ? "Account security"
            : null;

  return (
    <div className="crumbs">
      <button className="c link" onClick={onHome}>
        Applications
      </button>
      {now && (
        <>
          <span className="sep">/</span>
          <span className="c now">{now}</span>
        </>
      )}
    </div>
  );
}

// Casca autenticada do app (sidebar + guarda de sessão). Client-side porque o
// server nunca gate-keeps "/" de fato — ver a nota em useCurrentUser.
export function AppShell() {
  const currentUser = useCurrentUser();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [appCount, setAppCount] = useState(0);
  const [teamCount, setTeamCount] = useState(0);

  const [userCount, setUserCount] = useState(0);

  const authenticatedUserId = currentUser.status === "authenticated" ? currentUser.user.id : null;
  const authenticatedUserIsRoot = currentUser.status === "authenticated" && currentUser.user.role === "root";
  const authenticatedUserCanManageUsers =
    currentUser.status === "authenticated" && (currentUser.user.role === "root" || currentUser.user.role === "admin");

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

  useEffect(() => {
    if (!authenticatedUserId) return;
    let cancelled = false;
    listApplications()
      .then((applications) => {
        if (!cancelled) setAppCount(applications.length);
      })
      .catch(() => {
        // Idem: contagem informativa no badge de nav, não crítica.
      });
    return () => {
      cancelled = true;
    };
  }, [authenticatedUserId]);

  useEffect(() => {
    if (!authenticatedUserId || !authenticatedUserIsRoot) return;
    let cancelled = false;
    listTeams()
      .then((teams) => {
        if (!cancelled) setTeamCount(teams.length);
      })
      .catch(() => {
        // Idem.
      });
    return () => {
      cancelled = true;
    };
  }, [authenticatedUserId, authenticatedUserIsRoot]);

  useEffect(() => {
    if (!authenticatedUserId || !authenticatedUserCanManageUsers) return;
    let cancelled = false;
    listUsers()
      .then((users) => {
        if (!cancelled) setUserCount(users.length);
      })
      .catch(() => {
        // Idem: contagem informativa no badge de nav, não crítica.
      });
    return () => {
      cancelled = true;
    };
  }, [authenticatedUserId, authenticatedUserCanManageUsers]);

  function badgeCountFor(to: string): number {
    if (to === "/") return appCount;
    if (to === "/teams") return teamCount;
    if (to === "/users") return userCount;
    if (to === "/approvals") return pendingCount;
    return 0;
  }

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
          <div>
            <div className="brand-name">
              to<b>Toggle</b>
            </div>
            <div className="brand-sub">feature flags</div>
          </div>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {NAV_ITEMS.filter(
            (item) => (!item.rootOnly || user.role === "root") && (!item.adminOrRoot || user.role === "root" || user.role === "admin")
          ).map((item) => {
            const count = badgeCountFor(item.to);
            const showCount = item.alwaysShowCount || count > 0;
            return (
              <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}>
                <Icon name={item.icon} size={17} />
                {item.label}
                {showCount && <span className="count">{count}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-foot" style={{ position: "relative" }}>
          <button className="user-chip" onClick={() => setMenuOpen((open) => !open)}>
            <div className="avatar">{user.username.slice(0, 2).toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
              <div className="nm">{user.username}</div>
              <div className="rl" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <RoleBadge role={user.role} />
              </div>
            </div>
            <Icon name="chevron-down" size={15} style={{ color: "var(--ink-4)" }} />
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
        <div className="topbar">
          <Crumbs pathname={location.pathname} onHome={() => navigate("/")} />
        </div>
        <Outlet context={{ user }} />
      </main>
    </div>
  );
}
