import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";
import { useSetOpenApp } from "../hooks/useSetOpenApp";
import type { ApplicationDetailTab } from "../hooks/useAppUser";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// AppShell agora computa commandPaletteData (apps.map/teams.map/users.map) em TODO render — um
// mock que devolve o corpo de sessão pra QUALQUER path (inclusive /api/applications) fazia
// `applications` virar esse objeto em vez de um array, e `.map` estourava assim que o fetch
// resolvia (às vezes depois que o teste já tinha terminado, como uma exceção não tratada
// aleatoriamente atribuída a um teste seguinte). `mockFetch` centraliza os defaults seguros
// (listas vazias) pros endpoints auxiliares que TODO AppShell busca no mount, deixando cada teste
// sobrescrever só o que importa pra ele via `overrides`.
function mockFetch(
  user: { id: string; username: string; role: "root" | "admin" | "user"; must_change_password: boolean },
  overrides: Record<string, () => Response> = {}
) {
  return vi.fn().mockImplementation((path: string) => {
    if (path in overrides) return Promise.resolve(overrides[path]());
    if (path === "/api/profile") return Promise.resolve(jsonResponse(200, { success: true, user }));
    if (path === "/api/applications") return Promise.resolve(jsonResponse(200, []));
    if (path === "/api/teams") return Promise.resolve(jsonResponse(200, { success: true, teams: [] }));
    if (path === "/api/users") return Promise.resolve(jsonResponse(200, { success: true, users: [] }));
    if (path === "/api/approval/requests/pending" || path === "/api/approval/requests/approvable") {
      return Promise.resolve(jsonResponse(200, { message: "ok", data: [] }));
    }
    return Promise.resolve(jsonResponse(200, {}));
  });
}

// Simula o que ApplicationDetailScreen faz de verdade (useSetOpenApp num useEffect, com a aba
// como estado local repassado via onTabChange) sem puxar a tela inteira (com seu próprio fetch
// de toggles/hierarquia) pra este teste de shell.
function FakeOpenAppScreen({ name, toggleCount, hasSecretKey }: { name: string; toggleCount: number; hasSecretKey: boolean }) {
  const setOpenApp = useSetOpenApp();
  const [tab, setTab] = useState<ApplicationDetailTab>("toggles");
  useEffect(() => {
    setOpenApp({ name, toggleCount, hasSecretKey, tab, onTabChange: setTab });
    return () => setOpenApp(null);
  }, [name, toggleCount, hasSecretKey, tab, setOpenApp]);
  return <div>App detail content</div>;
}

function renderShell(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<div>Applications content</div>} />
          <Route path="/teams" element={<div>Teams content</div>} />
          <Route path="/account/security" element={<div>Account security content</div>} />
          <Route
            path="/applications/:id"
            element={<FakeOpenAppScreen name="Billing Service" toggleCount={5} hasSecretKey={true} />}
          />
        </Route>
        <Route path="/login" element={<div>Login screen</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("AppShell", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("renders the sidebar, topbar and routed content once authenticated", async () => {
    vi.stubGlobal("fetch", mockFetch({ id: "1", username: "root", role: "root", must_change_password: false }));

    renderShell();

    expect(await screen.findByText("Applications content")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /applications/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /teams/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /approvals/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /history/i })).toBeInTheDocument();
    expect(screen.getByText("root")).toBeInTheDocument();
  });

  it("mobile nav: burger opens the sidebar+scrim, and clicking a nav item closes it", async () => {
    vi.stubGlobal("fetch", mockFetch({ id: "1", username: "root", role: "root", must_change_password: false }));
    const user = userEvent.setup();

    const { container } = renderShell();
    await screen.findByText("Applications content");

    expect(container.querySelector(".nav-scrim")).not.toBeInTheDocument();
    expect(container.querySelector(".sidebar")).not.toHaveClass("open");

    await user.click(screen.getByRole("button", { name: "Menu" }));
    expect(container.querySelector(".sidebar")).toHaveClass("open");
    expect(container.querySelector(".nav-scrim")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: /teams/i }));
    expect(container.querySelector(".sidebar")).not.toHaveClass("open");
    expect(container.querySelector(".nav-scrim")).not.toBeInTheDocument();
  });

  it("mobile nav: clicking the scrim closes the sidebar without navigating away", async () => {
    vi.stubGlobal("fetch", mockFetch({ id: "1", username: "root", role: "root", must_change_password: false }));
    const user = userEvent.setup();

    const { container } = renderShell();
    await screen.findByText("Applications content");

    await user.click(screen.getByRole("button", { name: "Menu" }));
    expect(container.querySelector(".nav-scrim")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Fechar menu" }));
    expect(container.querySelector(".sidebar")).not.toHaveClass("open");
    expect(container.querySelector(".nav-scrim")).not.toBeInTheDocument();
    expect(screen.getByText("Applications content")).toBeInTheDocument();
  });

  it("shows the brand subtitle and a single 'Applications' crumb (no second level) on the home route", async () => {
    vi.stubGlobal("fetch", mockFetch({ id: "1", username: "root", role: "root", must_change_password: false }));

    const { container } = renderShell();
    await screen.findByText("Applications content");

    expect(screen.getByText("feature flags")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^applications$/i })).toBeInTheDocument();
    expect(container.querySelector(".c.now")).not.toBeInTheDocument();
  });

  it("adds a second breadcrumb level naming the active section for a nested route", async () => {
    vi.stubGlobal("fetch", mockFetch({ id: "1", username: "root", role: "root", must_change_password: false }));

    renderShell("/account/security");
    await screen.findByText("Account security content");

    expect(screen.getByRole("button", { name: /^applications$/i })).toBeInTheDocument();
    expect(screen.getByText("Account security", { selector: ".c.now" })).toBeInTheDocument();
  });

  it("navigates home when the 'Applications' breadcrumb is clicked from a nested route", async () => {
    vi.stubGlobal("fetch", mockFetch({ id: "1", username: "root", role: "root", must_change_password: false }));
    const user = userEvent.setup();

    renderShell("/teams");
    await screen.findByText("Teams content");
    expect(screen.getByText("Teams & people", { selector: ".c.now" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^applications$/i }));

    expect(await screen.findByText("Applications content")).toBeInTheDocument();
  });

  it("shows the user's avatar initials and role badge in the collapsed profile row", async () => {
    vi.stubGlobal("fetch", mockFetch({ id: "1", username: "root", role: "root", must_change_password: false }));

    renderShell();
    await screen.findByText("Applications content");

    expect(screen.getByText("RO", { selector: ".avatar" })).toBeInTheDocument();
    expect(screen.getByText("Root", { selector: "span" })).toBeInTheDocument();
  });

  it("shows an applications count badge next to 'Applications' and a teams count badge for root", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(
        { id: "1", username: "root", role: "root", must_change_password: false },
        {
          "/api/applications": () => jsonResponse(200, [{ id: "1" }, { id: "2" }]),
          "/api/teams": () => jsonResponse(200, { success: true, teams: [{ id: "t1" }] }),
        }
      )
    );

    renderShell();
    await screen.findByText("Applications content");

    const appsLink = await screen.findByRole("link", { name: /applications/i });
    expect(appsLink).toHaveTextContent("2");
    const teamsLink = await screen.findByRole("link", { name: /teams/i });
    expect(teamsLink).toHaveTextContent("1");
  });

  it("does not fetch or show a teams count badge for a non-root user", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(
        { id: "2", username: "alice", role: "admin", must_change_password: false },
        {
          "/api/teams": () => {
            throw new Error("must not fetch teams for a non-root user");
          },
        }
      )
    );

    renderShell();

    expect(await screen.findByText("Applications content")).toBeInTheDocument();
  });

  // O protótipo foi atualizado com uma tela de usuários de verdade (UsersView) e um item de nav
  // confirmado ("Usuários", canManageUsers = root || admin) — diferente de uma fase anterior,
  // onde "Users" tinha sido removido do menu por não ter respaldo nenhum no protótipo.
  it("shows the 'Usuários' nav link for root and for admin, but not for a read-only user", async () => {
    vi.stubGlobal("fetch", mockFetch({ id: "1", username: "root", role: "root", must_change_password: false }));
    const { unmount } = renderShell();
    await screen.findByText("Applications content");
    expect(screen.getByRole("link", { name: /usuários/i })).toBeInTheDocument();
    unmount();

    vi.stubGlobal("fetch", mockFetch({ id: "2", username: "alice", role: "admin", must_change_password: false }));
    const { unmount: unmount2 } = renderShell();
    await screen.findByText("Applications content");
    expect(screen.getByRole("link", { name: /usuários/i })).toBeInTheDocument();
    unmount2();

    vi.stubGlobal("fetch", mockFetch({ id: "3", username: "bob", role: "user", must_change_password: false }));
    renderShell();
    await screen.findByText("Applications content");
    expect(screen.queryByRole("link", { name: /usuários/i })).not.toBeInTheDocument();
  });

  it("hides 'Teams & people' for non-root users (the API is RequireRoot())", async () => {
    vi.stubGlobal("fetch", mockFetch({ id: "2", username: "alice", role: "admin", must_change_password: false }));

    renderShell();

    expect(await screen.findByText("Applications content")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /teams/i })).not.toBeInTheDocument();
  });

  // Confirmado no app.jsx real (v2.6 §2.7): `showApprovalsNav || !isRootUser` — mesmo um
  // usuário `user` comum (nunca aprovador) precisa ver o item, pra acompanhar a aba "Mine" das
  // próprias sugestões/solicitações. Diferente de "Teams & people"/"Usuários" acima, que são
  // mesmo root/admin-only porque a API por trás é RequireRoot()/RequireAdmin().
  it("shows 'Approvals' even for a plain 'user' role, who is never an approver", async () => {
    vi.stubGlobal("fetch", mockFetch({ id: "3", username: "bob", role: "user", must_change_password: false }));

    renderShell();

    expect(await screen.findByText("Applications content")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /approvals/i })).toBeInTheDocument();
  });

  it("shows a pending-approvals count badge next to 'Approvals' for root", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(
        { id: "1", username: "root", role: "root", must_change_password: false },
        { "/api/approval/requests/pending": () => jsonResponse(200, { message: "ok", data: [{ id: "1" }, { id: "2" }, { id: "3" }] }) }
      )
    );

    renderShell();
    await screen.findByText("Applications content");

    const approvalsLink = await screen.findByRole("link", { name: /approvals/i });
    expect(await screen.findByText("3")).toBeInTheDocument();
    expect(approvalsLink).toHaveTextContent("3");
  });

  it("uses the approvable endpoint (not pending) for the badge count on non-root roles", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(
        { id: "2", username: "alice", role: "admin", must_change_password: false },
        { "/api/approval/requests/approvable": () => jsonResponse(200, { message: "ok", data: [{ id: "1" }] }) }
      )
    );

    renderShell();
    await screen.findByText("Applications content");

    expect(await screen.findByText("1")).toBeInTheDocument();
  });

  it("does not show a count badge on Approvals when there are no pending approvals (unlike Applications/Teams, which always show one)", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(
        { id: "1", username: "root", role: "root", must_change_password: false },
        { "/api/approval/requests/pending": () => jsonResponse(200, { message: "ok", data: [] }) }
      )
    );

    renderShell();
    await screen.findByText("Applications content");
    const approvalsLink = await screen.findByRole("link", { name: /^approvals$/i });

    expect(approvalsLink.querySelector(".count")).not.toBeInTheDocument();
  });

  it("always shows a count badge on Applications and Teams, even when it is zero", async () => {
    vi.stubGlobal("fetch", mockFetch({ id: "1", username: "root", role: "root", must_change_password: false }));

    renderShell();
    await screen.findByText("Applications content");
    const appsLink = await screen.findByRole("link", { name: /^applications/i });
    const teamsLink = await screen.findByRole("link", { name: /teams/i });

    expect(appsLink.querySelector(".count")).toHaveTextContent("0");
    expect(teamsLink.querySelector(".count")).toHaveTextContent("0");
  });

  it("redirects to /login when there is no valid session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { error: "Authorization token required" })));

    renderShell();

    expect(await screen.findByText("Login screen")).toBeInTheDocument();
  });

  it("logs out and redirects to /login when 'Sign out' is used", async () => {
    const fetchMock = mockFetch(
      { id: "1", username: "root", role: "root", must_change_password: false },
      { "/api/auth/logout": () => jsonResponse(200, { success: true, message: "Logged out successfully" }) }
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderShell();
    await screen.findByText("Applications content");

    await user.click(screen.getByRole("button", { name: /root/i }));
    await user.click(screen.getByRole("button", { name: /sign out/i }));

    expect(await screen.findByText("Login screen")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST" }));
  });

  it("shows a sidebar sub-navigation (app name, Toggles count, Service key dot) once a nested screen reports an open app", async () => {
    vi.stubGlobal("fetch", mockFetch({ id: "1", username: "root", role: "root", must_change_password: false }));

    renderShell("/applications/app1");
    await screen.findByText("App detail content");

    expect(screen.getByText("Billing Service", { selector: ".nav-label" })).toBeInTheDocument();
    const togglesLink = screen.getByRole("button", { name: /toggles/i });
    expect(togglesLink).toHaveTextContent("5");
    expect(screen.getByRole("button", { name: /service key/i }).querySelector(".key-active-dot")).toBeInTheDocument();
  });

  it("switches the sub-nav active tab and the breadcrumb's 3rd level when 'Service key' is clicked, and back when the app-name crumb is clicked", async () => {
    vi.stubGlobal("fetch", mockFetch({ id: "1", username: "root", role: "root", must_change_password: false }));
    const user = userEvent.setup();

    renderShell("/applications/app1");
    await screen.findByText("App detail content");

    const togglesTab = screen.getByRole("button", { name: /toggles/i });
    const keysTab = screen.getByRole("button", { name: /service key/i });
    expect(togglesTab).toHaveClass("active");
    expect(keysTab).not.toHaveClass("active");
    expect(screen.getByText("Toggles", { selector: ".c.now" })).toBeInTheDocument();

    await user.click(keysTab);
    expect(keysTab).toHaveClass("active");
    expect(togglesTab).not.toHaveClass("active");
    expect(screen.getByText("Service key", { selector: ".c.now" })).toBeInTheDocument();

    await user.click(screen.getByText("Billing Service", { selector: ".c.link" }));
    expect(togglesTab).toHaveClass("active");
    expect(screen.getByText("Toggles", { selector: ".c.now" })).toBeInTheDocument();
  });

  it("hides the sidebar sub-navigation once the route leaves the open application", async () => {
    vi.stubGlobal("fetch", mockFetch({ id: "1", username: "root", role: "root", must_change_password: false }));
    const user = userEvent.setup();

    renderShell("/applications/app1");
    await screen.findByText("App detail content");
    expect(screen.getByText("Billing Service", { selector: ".nav-label" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^applications$/i }));

    expect(await screen.findByText("Applications content")).toBeInTheDocument();
    expect(screen.queryByText("Billing Service", { selector: ".nav-label" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /service key/i })).not.toBeInTheDocument();
  });

  it("navigates to /account/security when 'Change password' is used", async () => {
    vi.stubGlobal("fetch", mockFetch({ id: "1", username: "root", role: "root", must_change_password: false }));
    const user = userEvent.setup();

    renderShell();
    await screen.findByText("Applications content");

    await user.click(screen.getByRole("button", { name: /root/i }));
    await user.click(screen.getByRole("button", { name: /change password/i }));

    expect(await screen.findByText("Account security content")).toBeInTheDocument();
  });

  // v2.6 §6.4: seção "Favorited" na sidebar — um item por app favoritada, um item por toggle
  // favoritado (mostrando o path pontilhado), com um divisor abaixo. `useFavorites` guarda seu
  // estado numa store módulo-level lida do localStorage só uma vez, no import (ver
  // hooks/useFavorites.ts) — testes que pré-semeiam localStorage precisam de
  // vi.resetModules() + reimport pra essa leitura acontecer de novo, diferente dos outros testes
  // deste arquivo, que nunca tocam favoritos.
  describe("Favorited section (v2.6 §6.4)", () => {
    function fetchMockWithApps(apps: { id: string; name: string }[]) {
      return vi.fn().mockImplementation((path: string) => {
        if (path === "/api/applications") return Promise.resolve(jsonResponse(200, apps));
        return Promise.resolve(
          jsonResponse(200, { success: true, user: { id: "1", username: "root", role: "root", must_change_password: false } })
        );
      });
    }

    async function renderShellWithFreshFavorites(seedFavorites: string[]) {
      if (seedFavorites.length > 0) {
        window.localStorage.setItem("totoggle_v2_favs", JSON.stringify(seedFavorites));
      }
      vi.resetModules();
      const { AppShell: FreshAppShell } = await import("./AppShell");
      return render(
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route element={<FreshAppShell />}>
              <Route path="/" element={<div>Applications content</div>} />
              <Route
                path="/applications/:id"
                element={<FakeOpenAppScreen name="Billing Service" toggleCount={5} hasSecretKey={true} />}
              />
            </Route>
          </Routes>
        </MemoryRouter>
      );
    }

    it("does not show the Favorited section when nothing is favorited", async () => {
      vi.stubGlobal("fetch", fetchMockWithApps([{ id: "1", name: "Checkout Web" }]));

      await renderShellWithFreshFavorites([]);
      await screen.findByText("Applications content");

      expect(screen.queryByText("Favorited")).not.toBeInTheDocument();
    });

    it("shows a favorited application and navigates to it on click", async () => {
      vi.stubGlobal("fetch", fetchMockWithApps([{ id: "1", name: "Checkout Web" }]));
      const user = userEvent.setup();

      await renderShellWithFreshFavorites(["app:1"]);
      await screen.findByText("Applications content");
      await screen.findByText("Favorited");

      await user.click(screen.getByRole("button", { name: /checkout web/i }));

      expect(await screen.findByText("App detail content")).toBeInTheDocument();
    });

    it("shows a favorited toggle by its dotted path and navigates with ?search= on click", async () => {
      vi.stubGlobal("fetch", fetchMockWithApps([{ id: "1", name: "Checkout Web" }]));
      const user = userEvent.setup();

      await renderShellWithFreshFavorites(["tg:1:payments.card"]);
      await screen.findByText("Applications content");

      await user.click(await screen.findByText("payments.card"));

      expect(await screen.findByText("App detail content")).toBeInTheDocument();
    });

    it("silently drops a favorite pointing at an application that no longer exists", async () => {
      vi.stubGlobal("fetch", fetchMockWithApps([{ id: "1", name: "Checkout Web" }]));

      await renderShellWithFreshFavorites(["app:gone", "tg:gone:x.y"]);
      await screen.findByText("Applications content");

      expect(screen.queryByText("Favorited")).not.toBeInTheDocument();
    });
  });

  // v2.6 §6.1/§6.2: command palette (⌘K/Ctrl+K) — dados (apps já carregados, times/pessoas
  // reaproveitados dos mesmos fetches que já alimentam os badges de contagem da sidebar, índice
  // de toggles buscado sob demanda) vivem em AppShell; a busca/agrupamento em si já é testada
  // isoladamente em lib/commandPalette.test.ts e components/CommandPalette.test.tsx — aqui só a
  // integração (atalho global, fetch lazy, navegação, gate por papel).
  describe("Command palette (v2.6 §6.1/§6.2)", () => {
    function fetchMockForPalette(opts: {
      role: "root" | "admin" | "user";
      apps: { id: string; name: string }[];
      hierarchies: Record<string, unknown[]>;
      teams?: { id: string; name: string }[];
      users?: { id: string; name: string; username: string }[];
    }) {
      let hierarchyFetches = 0;
      const fetchMock = vi.fn().mockImplementation((path: string) => {
        if (path === "/api/applications") return Promise.resolve(jsonResponse(200, opts.apps));
        if (path === "/api/teams") return Promise.resolve(jsonResponse(200, { success: true, teams: opts.teams ?? [] }));
        if (path === "/api/users") return Promise.resolve(jsonResponse(200, { success: true, users: opts.users ?? [] }));
        const hierarchyMatch = path.match(/^\/api\/applications\/([^/]+)\/toggles\?hierarchy=true$/);
        if (hierarchyMatch) {
          hierarchyFetches++;
          return Promise.resolve(jsonResponse(200, { application: hierarchyMatch[1], toggles: opts.hierarchies[hierarchyMatch[1]] ?? [] }));
        }
        return Promise.resolve(
          jsonResponse(200, { success: true, user: { id: "1", username: "u1", role: opts.role, must_change_password: false } })
        );
      });
      return { fetchMock, hierarchyFetchCount: () => hierarchyFetches };
    }

    it("opens with ⌘K and closes again on a second press (toggle, not just open)", async () => {
      const { fetchMock } = fetchMockForPalette({ role: "root", apps: [], hierarchies: {} });
      vi.stubGlobal("fetch", fetchMock);

      renderShell();
      await screen.findByText("Applications content");
      expect(screen.queryByPlaceholderText(/search applications/i)).not.toBeInTheDocument();

      fireEvent.keyDown(window, { key: "k", metaKey: true });
      expect(await screen.findByPlaceholderText(/search applications/i)).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "k", metaKey: true });
      expect(screen.queryByPlaceholderText(/search applications/i)).not.toBeInTheDocument();
    });

    it("closes on Escape (via the palette's own input)", async () => {
      const { fetchMock } = fetchMockForPalette({ role: "root", apps: [], hierarchies: {} });
      vi.stubGlobal("fetch", fetchMock);

      renderShell();
      await screen.findByText("Applications content");
      fireEvent.keyDown(window, { key: "k", ctrlKey: true });
      const input = await screen.findByPlaceholderText(/search applications/i);

      fireEvent.keyDown(input, { key: "Escape" });

      expect(screen.queryByPlaceholderText(/search applications/i)).not.toBeInTheDocument();
    });

    it("lazily fetches every application's toggle hierarchy on first open, and caches it (no refetch on reopen)", async () => {
      const { fetchMock, hierarchyFetchCount } = fetchMockForPalette({
        role: "root",
        apps: [
          { id: "app-1", name: "Checkout Web" },
          { id: "app-2", name: "Billing" },
        ],
        hierarchies: {
          "app-1": [{ id: "t1", value: "payments", enabled: true, toggles: [{ id: "t2", value: "card", enabled: true }] }],
          "app-2": [],
        },
      });
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();

      renderShell();
      await screen.findByText("Applications content");

      fireEvent.keyDown(window, { key: "k", metaKey: true });
      await user.type(await screen.findByPlaceholderText(/search applications/i), "payments");

      expect(await screen.findByText("payments.card")).toBeInTheDocument();
      expect(screen.getByText("Checkout Web", { selector: ".cmdk-sub" })).toBeInTheDocument();
      expect(hierarchyFetchCount()).toBe(2);

      // Fecha e reabre — não deve refazer as chamadas de hierarquia (índice já em cache).
      fireEvent.keyDown(window, { key: "k", metaKey: true });
      fireEvent.keyDown(window, { key: "k", metaKey: true });
      await user.type(await screen.findByPlaceholderText(/search applications/i), "payments");
      await screen.findByText("payments.card");

      expect(hierarchyFetchCount()).toBe(2);
    });

    it("navigates to the application when clicking an app result", async () => {
      const { fetchMock } = fetchMockForPalette({ role: "root", apps: [{ id: "app-1", name: "Checkout Web" }], hierarchies: {} });
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();

      renderShell();
      await screen.findByText("Applications content");
      fireEvent.keyDown(window, { key: "k", metaKey: true });
      await screen.findByPlaceholderText(/search applications/i);

      await user.click(screen.getByRole("button", { name: /checkout web/i }));

      expect(await screen.findByText("App detail content")).toBeInTheDocument();
      expect(screen.queryByPlaceholderText(/search applications/i)).not.toBeInTheDocument();
    });

    it("shows Teams and People results for root", async () => {
      const { fetchMock } = fetchMockForPalette({
        role: "root",
        apps: [],
        hierarchies: {},
        teams: [{ id: "t1", name: "Payments Squad" }],
        users: [{ id: "u1", name: "Alice Root", username: "alice" }],
      });
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();

      renderShell();
      await screen.findByText("Applications content");
      fireEvent.keyDown(window, { key: "k", metaKey: true });
      await user.type(await screen.findByPlaceholderText(/search applications/i), "a");

      expect(await screen.findByText("Payments Squad")).toBeInTheDocument();
      expect(screen.getByText("Alice Root")).toBeInTheDocument();
    });

    it("hides Teams (root-only route) but still shows People for an admin", async () => {
      const { fetchMock } = fetchMockForPalette({
        role: "admin",
        apps: [],
        hierarchies: {},
        teams: [{ id: "t1", name: "Payments Squad" }],
        users: [{ id: "u1", name: "Alice Root", username: "alice" }],
      });
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();

      renderShell();
      await screen.findByText("Applications content");
      fireEvent.keyDown(window, { key: "k", metaKey: true });
      await user.type(await screen.findByPlaceholderText(/search applications/i), "a");

      expect(await screen.findByText("Alice Root")).toBeInTheDocument();
      expect(screen.queryByText("Payments Squad")).not.toBeInTheDocument();
    });

    it("hides both Teams and People for a plain 'user' role", async () => {
      const { fetchMock } = fetchMockForPalette({
        role: "user",
        apps: [],
        hierarchies: {},
        teams: [{ id: "t1", name: "Payments Squad" }],
        users: [{ id: "u1", name: "Alice Root", username: "alice" }],
      });
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();

      renderShell();
      await screen.findByText("Applications content");
      fireEvent.keyDown(window, { key: "k", metaKey: true });
      await user.type(await screen.findByPlaceholderText(/search applications/i), "a");

      expect(screen.queryByText("Payments Squad")).not.toBeInTheDocument();
      expect(screen.queryByText("Alice Root")).not.toBeInTheDocument();
    });
  });

  // v2.6 §6.7-6.9: onboarding wizard nav item — root only (creating a team, the wizard's first
  // step, is RequireRoot() on the backend, so no other role could ever finish it).
  describe("Onboarding wizard nav item (v2.6 §6.7-6.9)", () => {
    it("shows 'Getting started' for root and opens the wizard on click", async () => {
      vi.stubGlobal("fetch", mockFetch({ id: "1", username: "root", role: "root", must_change_password: false }));
      const user = userEvent.setup();

      renderShell();
      await screen.findByText("Applications content");
      const navItem = screen.getByRole("button", { name: /getting started/i });

      await user.click(navItem);

      expect(await screen.findByText("Set up toToggle in 6 steps")).toBeInTheDocument();
    });

    it("hides the nav item entirely for a non-root role", async () => {
      vi.stubGlobal("fetch", mockFetch({ id: "2", username: "alice", role: "admin", must_change_password: false }));

      renderShell();

      expect(await screen.findByText("Applications content")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /getting started/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /review setup/i })).not.toBeInTheDocument();
    });

    it("shows 'Review setup' instead of 'Getting started' once already onboarded, and closing the wizard keeps the label in sync", async () => {
      window.localStorage.setItem("totoggle_v2_onboarded", "1");
      vi.stubGlobal("fetch", mockFetch({ id: "1", username: "root", role: "root", must_change_password: false }));
      const user = userEvent.setup();

      renderShell();
      await screen.findByText("Applications content");
      expect(screen.getByRole("button", { name: /review setup/i })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /review setup/i }));
      await user.click(screen.getByRole("button", { name: /skip tour/i }));

      expect(screen.getByRole("button", { name: /review setup/i })).toBeInTheDocument();
    });
  });
});
