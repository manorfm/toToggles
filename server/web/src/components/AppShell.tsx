import { useEffect, useState } from "react";
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useCurrentUser } from "../hooks/useCurrentUser";
import type { OpenAppInfo } from "../hooks/useAppUser";
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
//   <button><Icon name="history" size={17}/> History</button>  {/* sem contador — "history" é um
//   glifo distinto de "clock" (espiral + ponteiros vs. relógio simples); usar "clock" aqui foi um
//   erro corrigido depois que o usuário sinalizou a barra lateral ainda diferente do protótipo */}
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
//
// Sub-navegação da aplicação aberta — confirmada no app.jsx real como um `<div className=
// "nav-label">{app.name}</div>` seguido de dois nav-items ("Toggles" com contador de
// `stats.total`, "Service key" com um indicador `.key-active-dot` quando existe chave ativa),
// que trocam de ABA dentro da mesma view (`setTab("toggles"|"keys")`). Nossa tela não tem essa
// separação em abas — Toggles e Service key ficam empilhados numa página só — então os dois
// itens aqui viram âncoras de scroll reais (`#toggles-section`/`#service-key-section`) em vez de
// fingir um estado de aba que não existe.
const NAV_ITEMS: { to: string; label: string; end?: boolean; rootOnly?: boolean; adminOrRoot?: boolean; icon: IconName; alwaysShowCount?: boolean }[] = [
  { to: "/", label: "Applications", end: true, icon: "apps", alwaysShowCount: true },
  { to: "/teams", label: "Teams & people", rootOnly: true, icon: "users", alwaysShowCount: true },
  { to: "/users", label: "Usuários", adminOrRoot: true, icon: "user", alwaysShowCount: true },
  { to: "/approvals", label: "Approvals", icon: "check" },
  { to: "/history", label: "History", icon: "history" },
];

// Breadcrumb no topo do conteúdo — confirmado no app.jsx real como uma trilha
// (.crumbs > .c.link "Applications" sempre clicável + .sep "/" + .c.now por seção), não um
// rótulo único. Dentro de uma aplicação aberta, o confirmado é 3 níveis
// ("Applications / {app.name} / Toggles") — o nome vem de `openApp`, que ApplicationDetailScreen
// preenche via useSetOpenApp assim que carrega a aplicação (ver hooks/useAppUser.ts#AppShellContext).
function Crumbs({ pathname, onHome, openAppName }: { pathname: string; onHome: () => void; openAppName: string | null }) {
  if (pathname.startsWith("/applications/") && openAppName) {
    return (
      <div className="crumbs">
        <button className="c link" onClick={onHome}>
          Applications
        </button>
        <span className="sep">/</span>
        <span className="c link">{openAppName}</span>
        <span className="sep">/</span>
        <span className="c now">Toggles</span>
      </div>
    );
  }

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
  // Off-canvas mobile nav (≤1024px, ver styles/global.css) — confirmado no app.jsx real do
  // protótipo v2.2 (decodificado do bundle, mesmo método de lib/toggleLeaves.ts): estado
  // `navOpen`, sidebar vira `<aside className={"sidebar"+(navOpen?" open":"")}>`, um botão
  // `.nav-scrim` só existe no DOM quando aberto (fecha ao clicar fora), e o próprio `<aside>`
  // fecha sozinho quando o clique cai dentro de um `.nav-item` (delegação, não um onClick por
  // item). Em telas largas o burger fica com `display:none` (global.css) e este estado nunca é
  // alcançável.
  const [navOpen, setNavOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [appCount, setAppCount] = useState(0);
  const [teamCount, setTeamCount] = useState(0);
  const [openApp, setOpenApp] = useState<OpenAppInfo | null>(null);

  // A tela de detalhe de aplicação é quem sabe esses dados (AppShell nunca busca uma aplicação
  // individual) — mas se o usuário navegar embora sem essa tela limpar o próprio estado (ex.:
  // clicar direto num item de nav em vez de "Applications"), os dados antigos não podem vazar
  // pro breadcrumb/sub-nav de outra rota.
  useEffect(() => {
    if (!location.pathname.startsWith("/applications/")) setOpenApp(null);
  }, [location.pathname]);

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
      <aside
        className={"sidebar" + (navOpen ? " open" : "")}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest(".nav-item")) setNavOpen(false);
        }}
      >
        <div className="brand">
          <div className="brand-mark">
            <Icon name="toggle" size={20} />
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

          {openApp && (
            <>
              <div className="nav-label">{openApp.name}</div>
              <button
                className="nav-item active"
                onClick={() => document.getElementById("toggles-section")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                <Icon name="layers" size={17} /> Toggles <span className="count">{openApp.toggleCount}</span>
              </button>
              <button
                className="nav-item"
                onClick={() => document.getElementById("service-key-section")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                <Icon name="key" size={17} /> Service key
                {openApp.hasSecretKey && <span className="count key-active-dot">●</span>}
              </button>
            </>
          )}
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
      </aside>

      {navOpen && <button className="nav-scrim" aria-label="Fechar menu" onClick={() => setNavOpen(false)} />}

      <main className="main">
        <div className="topbar">
          <button className="btn btn-icon btn-soft nav-burger" aria-label="Menu" onClick={() => setNavOpen(true)}>
            <Icon name="menu" size={18} />
          </button>
          <Crumbs pathname={location.pathname} onHome={() => navigate("/")} openAppName={openApp?.name ?? null} />
        </div>
        <Outlet context={{ user, setOpenApp }} />
      </main>
    </div>
  );
}
