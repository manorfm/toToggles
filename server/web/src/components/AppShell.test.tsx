import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderShell(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<div>Applications content</div>} />
          <Route path="/teams" element={<div>Teams content</div>} />
          <Route path="/account/security" element={<div>Account security content</div>} />
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

  // "Users" não existe em nenhum texto confirmado de App — foi um item de nav inventado
  // numa fase anterior sem essa tela ter equivalente no protótipo. A tela em si continua
  // acessível por URL direta (/user-management), só não é mais um destino de navegação.
  it("does not show a 'Users' nav link (not a confirmed prototype nav destination)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, { success: true, user: { id: "1", username: "root", role: "root", must_change_password: false } })
      )
    );

    renderShell();
    await screen.findByText("Applications content");

    expect(screen.queryByRole("link", { name: /^users$/i })).not.toBeInTheDocument();
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
