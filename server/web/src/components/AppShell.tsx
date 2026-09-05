import { useEffect, useState } from "react";
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useCurrentUser } from "../hooks/useCurrentUser";
import type { OpenAppInfo } from "../hooks/useAppUser";
import { useFavorites } from "../hooks/useFavorites";
import { listApplications } from "../api/applications";
import { listApprovableApprovals, listPendingApprovals } from "../api/approvals";
import { listTeams } from "../api/teams";
import { getToggleHierarchy } from "../api/toggles";
import { listUsers } from "../api/users";
import { logout } from "../api/profile";
import { favoriteAppIds, favoriteToggleRefs } from "../lib/favorites";
import type { CommandPaletteData, CommandPaletteToggleHit } from "../lib/commandPalette";
import { isOnboarded } from "../lib/onboarding";
import { leafDottedPaths } from "../lib/toggleLeaves";
import type { Application } from "../types/application";
import type { TeamWithCounts } from "../types/team";
import type { User } from "../types/user";
import { CommandPalette } from "./CommandPalette";
import { Icon, type IconName } from "./Icon";
import { OnboardingModal } from "./OnboardingModal";
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
// que trocam de ABA dentro da mesma view (`setTab("toggles"|"keys")`) — ApplicationDetailScreen
// virou aba de verdade (ver o comentário no topo desse arquivo) numa fase anterior que só tinha
// as duas seções empilhadas numa página só, com âncoras de scroll fingindo um estado de aba que
// não existia. `openApp.tab`/`openApp.onTabChange` (ver hooks/useAppUser.ts) são a fonte real.
const NAV_ITEMS: { to: string; label: string; end?: boolean; rootOnly?: boolean; adminOrRoot?: boolean; icon: IconName; alwaysShowCount?: boolean }[] = [
  { to: "/", label: "Applications", end: true, icon: "apps", alwaysShowCount: true },
  { to: "/teams", label: "Teams & people", rootOnly: true, icon: "users", alwaysShowCount: true },
  { to: "/users", label: "Usuários", adminOrRoot: true, icon: "user", alwaysShowCount: true },
  { to: "/approvals", label: "Approvals", icon: "check" },
  { to: "/history", label: "History", icon: "history" },
];

// Breadcrumb no topo do conteúdo — confirmado no app.jsx real como uma trilha
// (.crumbs > .c.link "Applications" sempre clicável + .sep "/" + .c.now por seção), não um
// rótulo único. Dentro de uma aplicação aberta, o confirmado é 3 níveis ("Applications /
// {app.name} / Toggles" ou ".../Service key", dependendo da aba ativa) — o 2º nível
// (`{app.name}`) é clicável e volta pra aba Toggles (`onClick={() => setTab("toggles")}` no
// protótipo real), o 3º nunca é. Os dados vêm de `openApp`, que ApplicationDetailScreen
// preenche via useSetOpenApp assim que carrega a aplicação (ver hooks/useAppUser.ts#AppShellContext).
function Crumbs({ pathname, onHome, openApp }: { pathname: string; onHome: () => void; openApp: OpenAppInfo | null }) {
  if (pathname.startsWith("/applications/") && openApp) {
    return (
      <div className="crumbs">
        <button className="c link" onClick={onHome}>
          Applications
        </button>
        <span className="sep">/</span>
        <button className="c link" onClick={() => openApp.onTabChange("toggles")}>
          {openApp.name}
        </button>
        <span className="sep">/</span>
        <span className="c now">{openApp.tab === "keys" ? "Service key" : "Toggles"}</span>
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
  // v2.6 §6.4: precisa da lista inteira (não só a contagem) pra resolver o nome de uma
  // aplicação favoritada na sidebar — reaproveita o mesmo fetch que já existia só pro badge de
  // contagem, em vez de duplicar a chamada a GET /applications. Contagens de nav (Applications/
  // Teams/Usuários) derivam de `.length` destas listas em vez de um state próprio — evita 3
  // pares "lista completa" + "contagem redundante" pro mesmo fetch.
  const [applications, setApplications] = useState<Application[]>([]);
  const [teams, setTeams] = useState<TeamWithCounts[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [openApp, setOpenApp] = useState<OpenAppInfo | null>(null);
  const { favorites } = useFavorites();
  // v2.6 §6.1/§6.2: command palette (⌘K/Ctrl+K). O índice de toggles é buscado sob demanda (não
  // no mount do shell) — teams/users já são fetchados eagerly de qualquer jeito pros badges da
  // sidebar acima, mas varrer a hierarquia de TODA aplicação só faz sentido quando alguém de fato
  // abre a busca. `null` = ainda não buscado; `[]` já é um resultado válido (nenhuma aplicação
  // com toggles) e não deve refazer o fetch.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toggleIndex, setToggleIndex] = useState<CommandPaletteToggleHit[] | null>(null);
  // v2.6 §6.7-6.9: onboarding wizard — root only (criar um team é RequireRoot() no backend, o
  // primeiro passo do wizard, então nenhum outro papel consegue completá-lo de qualquer forma).
  // `onboarded` só é reavaliado ao fechar o modal (não precisa ser reativo o tempo todo — é uma
  // flag de localStorage que só muda dentro desta mesma tela).
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboarded, setOnboarded] = useState(isOnboarded());

  // A tela de detalhe de aplicação é quem sabe esses dados (AppShell nunca busca uma aplicação
  // individual) — mas se o usuário navegar embora sem essa tela limpar o próprio estado (ex.:
  // clicar direto num item de nav em vez de "Applications"), os dados antigos não podem vazar
  // pro breadcrumb/sub-nav de outra rota.
  useEffect(() => {
    if (!location.pathname.startsWith("/applications/")) setOpenApp(null);
  }, [location.pathname]);

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
      .then((apps) => {
        if (!cancelled) setApplications(apps);
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
      .then((fetched) => {
        if (!cancelled) setTeams(fetched);
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
      .then((fetched) => {
        if (!cancelled) setUsers(fetched);
      })
      .catch(() => {
        // Idem: contagem informativa no badge de nav, não crítica.
      });
    return () => {
      cancelled = true;
    };
  }, [authenticatedUserId, authenticatedUserCanManageUsers]);

  // v2.6 §6.1/§6.2: ⌘K/Ctrl+K abre/fecha a paleta de qualquer tela autenticada — precisa viver
  // acima dos `return` antecipados abaixo (regra dos hooks), mesmo padrão dos demais useEffect
  // deste componente.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Busca a hierarquia de toggles de TODA aplicação em paralelo — só na primeira vez que a
  // paleta abre (não no mount do shell) e só uma vez por sessão (cache em `toggleIndex`,
  // guardado por `!== null`). `applications` já vem do fetch de badge acima; nenhuma aplicação
  // ainda carregada só adia a busca pro próximo open, não trava em `[]` permanentemente.
  useEffect(() => {
    if (!paletteOpen || toggleIndex !== null || applications.length === 0) return;
    let cancelled = false;
    Promise.all(
      applications.map((app) =>
        getToggleHierarchy(app.id).then((tree) =>
          leafDottedPaths(tree).map((path): CommandPaletteToggleHit => ({ appId: app.id, appName: app.name, path }))
        )
      )
    )
      .then((perApp) => {
        if (!cancelled) setToggleIndex(perApp.flat());
      })
      .catch(() => {
        if (!cancelled) setToggleIndex([]);
      });
    return () => {
      cancelled = true;
    };
  }, [paletteOpen, toggleIndex, applications]);

  function badgeCountFor(to: string): number {
    if (to === "/") return applications.length;
    if (to === "/teams") return teams.length;
    if (to === "/users") return users.length;
    if (to === "/approvals") return pendingCount;
    return 0;
  }

  // v2.6 §6.4: seção "Favorited" na sidebar — confirmado no app.jsx real (favApps/favToggles,
  // decodificado do bundle comprimido). Só existe quando há pelo menos um favorito de qualquer
  // tipo; um toggle favoritado cujo app já não existe mais (apagado) é descartado em silêncio
  // (mesmo `.filter(Boolean)`/`.filter(f => f.app)` do protótipo real).
  const favApps = favoriteAppIds(favorites)
    .map((id) => applications.find((a) => a.id === id))
    .filter((a): a is Application => !!a);
  const favToggles: { path: string; app: Application }[] = [];
  for (const ref of favoriteToggleRefs(favorites)) {
    const app = applications.find((a) => a.id === ref.appId);
    if (app) favToggles.push({ path: ref.path, app });
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

  // v2.6 §6.1/§6.2: Teams é root-only (mesma regra do item de nav "/teams" — a API por trás é
  // RequireRoot()); People/Usuários segue canManageUsers (root ou admin), mesma regra do item de
  // nav "/users". Gate fica aqui (quem monta os dados), não em lib/commandPalette.ts, que só
  // filtra o que recebe.
  const commandPaletteData: CommandPaletteData = {
    apps: applications.map((a) => ({ id: a.id, name: a.name })),
    toggles: toggleIndex ?? [],
    teams: user.role === "root" ? teams.map((t) => ({ id: t.id, name: t.name })) : [],
    people: authenticatedUserCanManageUsers ? users.map((u) => ({ id: u.id, name: u.name, username: u.username })) : [],
  };

  function goToApp(appId: string) {
    setPaletteOpen(false);
    navigate(`/applications/${appId}`);
  }

  function goToToggle(appId: string, path: string) {
    setPaletteOpen(false);
    navigate(`/applications/${appId}?tab=toggles&search=${encodeURIComponent(path)}`);
  }

  function goToTeams() {
    setPaletteOpen(false);
    navigate("/teams");
  }

  function goToUsers() {
    setPaletteOpen(false);
    navigate("/users");
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
          {(favApps.length > 0 || favToggles.length > 0) && (
            <>
              <div className="nav-label">Favorited</div>
              {favApps.map((a) => (
                <button key={a.id} className="nav-item" onClick={() => navigate(`/applications/${a.id}`)}>
                  <Icon name="apps" size={17} /> {a.name}
                </button>
              ))}
              {favToggles.map((ft, i) => (
                <button
                  key={i}
                  className="nav-item"
                  onClick={() => navigate(`/applications/${ft.app.id}?tab=toggles&search=${encodeURIComponent(ft.path)}`)}
                >
                  <Icon name="layers" size={17} /> <span className="mono" style={{ fontSize: 12 }}>{ft.path}</span>
                </button>
              ))}
              <div className="nav-divider" />
            </>
          )}
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
                className={"nav-item" + (openApp.tab === "toggles" ? " active" : "")}
                onClick={() => openApp.onTabChange("toggles")}
              >
                <Icon name="layers" size={17} /> Toggles <span className="count">{openApp.toggleCount}</span>
              </button>
              <button
                className={"nav-item" + (openApp.tab === "keys" ? " active" : "")}
                onClick={() => openApp.onTabChange("keys")}
              >
                <Icon name="key" size={17} /> Service key
                {openApp.hasSecretKey && <span className="count key-active-dot">●</span>}
              </button>
            </>
          )}
        </nav>

        {user.role === "root" && (
          <button
            className={"nav-item" + (onboardingOpen ? " active" : "")}
            onClick={() => setOnboardingOpen(true)}
          >
            <Icon name="rocket" size={17} /> {onboarded ? "Review setup" : "Getting started"}
          </button>
        )}

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
          <Crumbs pathname={location.pathname} onHome={() => navigate("/")} openApp={openApp} />
        </div>
        <Outlet context={{ user, setOpenApp }} />
      </main>

      {paletteOpen && (
        <CommandPalette
          data={commandPaletteData}
          onClose={() => setPaletteOpen(false)}
          onGoApp={goToApp}
          onGoToggle={goToToggle}
          onGoTeams={goToTeams}
          onGoUsers={goToUsers}
        />
      )}

      {onboardingOpen && (
        <OnboardingModal
          existingTeams={teams.map((t) => ({ id: t.id, name: t.name }))}
          existingApps={applications.map((a) => ({ id: a.id, name: a.name }))}
          existingUsernames={users.map((u) => u.username)}
          onClose={() => {
            setOnboardingOpen(false);
            setOnboarded(isOnboarded());
          }}
        />
      )}
    </div>
  );
}
