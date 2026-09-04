import { render, screen } from "@testing-library/react";
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
  });

  it("renders the sidebar, topbar and routed content once authenticated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, { success: true, user: { id: "1", username: "root", role: "root", must_change_password: false } })
      )
    );

    renderShell();

    expect(await screen.findByText("Applications content")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /applications/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /teams/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /approvals/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /history/i })).toBeInTheDocument();
    expect(screen.getByText("root")).toBeInTheDocument();
  });

  it("mobile nav: burger opens the sidebar+scrim, and clicking a nav item closes it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, { success: true, user: { id: "1", username: "root", role: "root", must_change_password: false } })
      )
    );
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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, { success: true, user: { id: "1", username: "root", role: "root", must_change_password: false } })
      )
    );
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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, { success: true, user: { id: "1", username: "root", role: "root", must_change_password: false } })
      )
    );

    const { container } = renderShell();
    await screen.findByText("Applications content");

    expect(screen.getByText("feature flags")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^applications$/i })).toBeInTheDocument();
    expect(container.querySelector(".c.now")).not.toBeInTheDocument();
  });

  it("adds a second breadcrumb level naming the active section for a nested route", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, { success: true, user: { id: "1", username: "root", role: "root", must_change_password: false } })
      )
    );

    renderShell("/account/security");
    await screen.findByText("Account security content");

    expect(screen.getByRole("button", { name: /^applications$/i })).toBeInTheDocument();
    expect(screen.getByText("Account security", { selector: ".c.now" })).toBeInTheDocument();
  });

  it("navigates home when the 'Applications' breadcrumb is clicked from a nested route", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, { success: true, user: { id: "1", username: "root", role: "root", must_change_password: false } })
      )
    );
    const user = userEvent.setup();

    renderShell("/teams");
    await screen.findByText("Teams content");
    expect(screen.getByText("Teams & people", { selector: ".c.now" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^applications$/i }));

    expect(await screen.findByText("Applications content")).toBeInTheDocument();
  });

  it("shows the user's avatar initials and role badge in the collapsed profile row", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, { success: true, user: { id: "1", username: "root", role: "root", must_change_password: false } })
      )
    );

    renderShell();
    await screen.findByText("Applications content");

    expect(screen.getByText("RO", { selector: ".avatar" })).toBeInTheDocument();
    expect(screen.getByText("Root", { selector: "span" })).toBeInTheDocument();
  });

  it("shows an applications count badge next to 'Applications' and a teams count badge for root", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === "/api/applications") return Promise.resolve(jsonResponse(200, [{ id: "1" }, { id: "2" }]));
      if (path === "/api/teams") return Promise.resolve(jsonResponse(200, { success: true, teams: [{ id: "t1" }] }));
      return Promise.resolve(
        jsonResponse(200, { success: true, user: { id: "1", username: "root", role: "root", must_change_password: false } })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    renderShell();
    await screen.findByText("Applications content");

    const appsLink = await screen.findByRole("link", { name: /applications/i });
    expect(appsLink).toHaveTextContent("2");
    const teamsLink = await screen.findByRole("link", { name: /teams/i });
    expect(teamsLink).toHaveTextContent("1");
  });

  it("does not fetch or show a teams count badge for a non-root user", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === "/api/teams") throw new Error("must not fetch teams for a non-root user");
      if (path === "/api/applications") return Promise.resolve(jsonResponse(200, []));
      return Promise.resolve(
        jsonResponse(200, { success: true, user: { id: "2", username: "alice", role: "admin", must_change_password: false } })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    renderShell();

    expect(await screen.findByText("Applications content")).toBeInTheDocument();
  });

  // O protótipo foi atualizado com uma tela de usuários de verdade (UsersView) e um item de nav
  // confirmado ("Usuários", canManageUsers = root || admin) — diferente de uma fase anterior,
  // onde "Users" tinha sido removido do menu por não ter respaldo nenhum no protótipo.
  it("shows the 'Usuários' nav link for root and for admin, but not for a read-only user", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, { success: true, user: { id: "1", username: "root", role: "root", must_change_password: false } })
      )
    );
    const { unmount } = renderShell();
    await screen.findByText("Applications content");
    expect(screen.getByRole("link", { name: /usuários/i })).toBeInTheDocument();
    unmount();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, { success: true, user: { id: "2", username: "alice", role: "admin", must_change_password: false } })
      )
    );
    const { unmount: unmount2 } = renderShell();
    await screen.findByText("Applications content");
    expect(screen.getByRole("link", { name: /usuários/i })).toBeInTheDocument();
    unmount2();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, { success: true, user: { id: "3", username: "bob", role: "user", must_change_password: false } })
      )
    );
    renderShell();
    await screen.findByText("Applications content");
    expect(screen.queryByRole("link", { name: /usuários/i })).not.toBeInTheDocument();
  });

  it("hides 'Teams & people' for non-root users (the API is RequireRoot())", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, { success: true, user: { id: "2", username: "alice", role: "admin", must_change_password: false } })
      )
    );

    renderShell();

    expect(await screen.findByText("Applications content")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /teams/i })).not.toBeInTheDocument();
  });

  // Confirmado no app.jsx real (v2.6 §2.7): `showApprovalsNav || !isRootUser` — mesmo um
  // usuário `user` comum (nunca aprovador) precisa ver o item, pra acompanhar a aba "Mine" das
  // próprias sugestões/solicitações. Diferente de "Teams & people"/"Usuários" acima, que são
  // mesmo root/admin-only porque a API por trás é RequireRoot()/RequireAdmin().
  it("shows 'Approvals' even for a plain 'user' role, who is never an approver", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, { success: true, user: { id: "3", username: "bob", role: "user", must_change_password: false } })
      )
    );

    renderShell();

    expect(await screen.findByText("Applications content")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /approvals/i })).toBeInTheDocument();
  });

  it("shows a pending-approvals count badge next to 'Approvals' for root", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === "/api/approval/requests/pending") {
        return Promise.resolve(jsonResponse(200, { message: "ok", data: [{ id: "1" }, { id: "2" }, { id: "3" }] }));
      }
      return Promise.resolve(
        jsonResponse(200, { success: true, user: { id: "1", username: "root", role: "root", must_change_password: false } })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    renderShell();
    await screen.findByText("Applications content");

    const approvalsLink = await screen.findByRole("link", { name: /approvals/i });
    expect(await screen.findByText("3")).toBeInTheDocument();
    expect(approvalsLink).toHaveTextContent("3");
  });

  it("uses the approvable endpoint (not pending) for the badge count on non-root roles", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === "/api/approval/requests/approvable") {
        return Promise.resolve(jsonResponse(200, { message: "ok", data: [{ id: "1" }] }));
      }
      return Promise.resolve(
        jsonResponse(200, { success: true, user: { id: "2", username: "alice", role: "admin", must_change_password: false } })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    renderShell();
    await screen.findByText("Applications content");

    expect(await screen.findByText("1")).toBeInTheDocument();
  });

  it("does not show a count badge on Approvals when there are no pending approvals (unlike Applications/Teams, which always show one)", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === "/api/approval/requests/pending") return Promise.resolve(jsonResponse(200, { message: "ok", data: [] }));
      return Promise.resolve(
        jsonResponse(200, { success: true, user: { id: "1", username: "root", role: "root", must_change_password: false } })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    renderShell();
    await screen.findByText("Applications content");
    const approvalsLink = await screen.findByRole("link", { name: /^approvals$/i });

    expect(approvalsLink.querySelector(".count")).not.toBeInTheDocument();
  });

  it("always shows a count badge on Applications and Teams, even when it is zero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, { success: true, user: { id: "1", username: "root", role: "root", must_change_password: false } })
      )
    );

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
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === "/api/auth/logout") return Promise.resolve(jsonResponse(200, { success: true, message: "Logged out successfully" }));
      return Promise.resolve(
        jsonResponse(200, { success: true, user: { id: "1", username: "root", role: "root", must_change_password: false } })
      );
    });
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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, { success: true, user: { id: "1", username: "root", role: "root", must_change_password: false } })
      )
    );

    renderShell("/applications/app1");
    await screen.findByText("App detail content");

    expect(screen.getByText("Billing Service", { selector: ".nav-label" })).toBeInTheDocument();
    const togglesLink = screen.getByRole("button", { name: /toggles/i });
    expect(togglesLink).toHaveTextContent("5");
    expect(screen.getByRole("button", { name: /service key/i }).querySelector(".key-active-dot")).toBeInTheDocument();
  });

  it("switches the sub-nav active tab and the breadcrumb's 3rd level when 'Service key' is clicked, and back when the app-name crumb is clicked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, { success: true, user: { id: "1", username: "root", role: "root", must_change_password: false } })
      )
    );
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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, { success: true, user: { id: "1", username: "root", role: "root", must_change_password: false } })
      )
    );
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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, { success: true, user: { id: "1", username: "root", role: "root", must_change_password: false } })
      )
    );
    const user = userEvent.setup();

    renderShell();
    await screen.findByText("Applications content");

    await user.click(screen.getByRole("button", { name: /root/i }));
    await user.click(screen.getByRole("button", { name: /change password/i }));

    expect(await screen.findByText("Account security content")).toBeInTheDocument();
  });
});
