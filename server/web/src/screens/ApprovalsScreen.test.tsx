import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Outlet } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApprovalsScreen } from "./ApprovalsScreen";
import { ToastProvider } from "../components/ToastProvider";
import type { AuthenticatedUser } from "../types/auth";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function FakeShell({ user }: { user: AuthenticatedUser }) {
  return <Outlet context={{ user }} />;
}

import { MemoryRouter, Route, Routes } from "react-router-dom";
function renderScreen(user: AuthenticatedUser) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/approvals"]}>
        <Routes>
          <Route element={<FakeShell user={user} />}>
            <Route path="/approvals" element={<ApprovalsScreen />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );
}

const root: AuthenticatedUser = { id: "1", username: "root", role: "root", must_change_password: false };
const admin: AuthenticatedUser = { id: "2", username: "alice", role: "admin", must_change_password: false };

const request = {
  id: "1",
  action_type: "toggle_delete",
  description: "",
  requested_by: "u2",
  team_id: "t1",
  toggle_path: "payments.card",
  status: "pending",
  expires_at: "",
  created_at: "2026-08-19T10:00:00Z",
  updated_at: "",
  requester_name: "bob",
  team_name: "Payments Squad",
};

const disabledConfig = {
  toggle_create: false,
  toggle_update: false,
  toggle_delete: true,
  toggle_enable: false,
  toggle_disable: false,
  toggle_rule: true,
  application_create: true,
  application_delete: true,
  secret_key_create: true,
  secret_key_delete: true,
};

function settings(overrides: Partial<{ approval_enabled: boolean; required_actions: typeof disabledConfig }> = {}) {
  return {
    id: "01SET00000000000000000001",
    approval_enabled: false,
    required_actions: disabledConfig,
    default_expiration_days: 7,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("ApprovalsScreen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches /approval/requests/pending for root, on the default Pending tab", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === "/api/approval/requests/pending") return Promise.resolve(jsonResponse(200, { message: "ok", data: [] }));
      if (path === "/api/approval/settings") return Promise.resolve(jsonResponse(200, { message: "ok", data: settings() }));
      return Promise.resolve(jsonResponse(200, { message: "ok", data: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderScreen(root);

    await screen.findByText(/tudo limpo/i);
    expect(fetchMock).toHaveBeenCalledWith("/api/approval/requests/pending", expect.anything());
  });

  it("fetches /approval/requests/approvable for non-root, and shows no status banner or Settings tab", async () => {
    // mockImplementation (não mockResolvedValue): cada chamada precisa do seu próprio objeto
    // Response — a tela dispara fetches concorrentes de verdade agora (requests + times/
    // aprovador-status pro banner de §2.10), e um único Response compartilhado só permite
    // .json() ser lido uma vez antes de rejeitar "body already used" nas demais.
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(200, { message: "ok", data: [] })));
    vi.stubGlobal("fetch", fetchMock);

    renderScreen(admin);

    await screen.findByText(/tudo limpo/i);
    expect(fetchMock).toHaveBeenCalledWith("/api/approval/requests/approvable", expect.anything());
    expect(screen.queryByRole("button", { name: /configurar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^settings$/i })).not.toBeInTheDocument();
  });

  it("warns a non-approver that none of their teams have an approver at all", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === "/api/profile/teams") return Promise.resolve(jsonResponse(200, { success: true, teams: [{ id: "t1", name: "Payments Squad" }] }));
      if (path === "/api/approval/my-approver-teams") return Promise.resolve(jsonResponse(200, { message: "ok", data: [] }));
      if (path === "/api/approval/teams-without-approver")
        return Promise.resolve(jsonResponse(200, { message: "ok", data: [{ id: "t1", name: "Payments Squad" }] }));
      return Promise.resolve(jsonResponse(200, { message: "ok", data: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderScreen(admin);

    expect(await screen.findByText(/not an approver on any of your teams/i)).toBeInTheDocument();
    expect(screen.getByText(/none of them have one/i)).toBeInTheDocument();
  });

  it("gives the milder message when some other team does have an approver", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === "/api/profile/teams")
        return Promise.resolve(
          jsonResponse(200, { success: true, teams: [{ id: "t1", name: "Payments Squad" }, { id: "t2", name: "Growth" }] })
        );
      if (path === "/api/approval/my-approver-teams") return Promise.resolve(jsonResponse(200, { message: "ok", data: [] }));
      // t2 has SOME approver (just not this user) — only t1 is in the without-approver list.
      if (path === "/api/approval/teams-without-approver")
        return Promise.resolve(jsonResponse(200, { message: "ok", data: [{ id: "t1", name: "Payments Squad" }] }));
      return Promise.resolve(jsonResponse(200, { message: "ok", data: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderScreen(admin);

    expect(await screen.findByText(/not an approver on any of your teams/i)).toBeInTheDocument();
    expect(screen.getByText(/an approver on your team will review it/i)).toBeInTheDocument();
    expect(screen.queryByText(/none of them have one/i)).not.toBeInTheDocument();
  });

  it("shows no banner at all once the user is confirmed an approver on some team", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === "/api/profile/teams") return Promise.resolve(jsonResponse(200, { success: true, teams: [{ id: "t1", name: "Payments Squad" }] }));
      if (path === "/api/approval/my-approver-teams") return Promise.resolve(jsonResponse(200, { message: "ok", data: ["t1"] }));
      if (path === "/api/approval/teams-without-approver") return Promise.resolve(jsonResponse(200, { message: "ok", data: [] }));
      return Promise.resolve(jsonResponse(200, { message: "ok", data: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderScreen(admin);
    await screen.findByText(/tudo limpo/i);

    expect(screen.queryByText(/not an approver on any of your teams/i)).not.toBeInTheDocument();
  });

  it("never shows the banner for root", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === "/api/approval/my-approver-teams" || path === "/api/approval/teams-without-approver" || path === "/api/profile/teams") {
        throw new Error("root must never fetch approver-status data — the banner is non-root only");
      }
      if (path === "/api/approval/settings") return Promise.resolve(jsonResponse(200, { message: "ok", data: settings() }));
      return Promise.resolve(jsonResponse(200, { message: "ok", data: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderScreen(root);

    await screen.findByText(/tudo limpo/i);
    expect(screen.queryByText(/not an approver on any of your teams/i)).not.toBeInTheDocument();
  });

  it("shows a root-only status banner reflecting the approval system state", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === "/api/approval/settings")
        return Promise.resolve(jsonResponse(200, { message: "ok", data: settings({ approval_enabled: true }) }));
      return Promise.resolve(jsonResponse(200, { message: "ok", data: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderScreen(root);

    expect(await screen.findByText(/sistema/i)).toBeInTheDocument();
    expect(screen.getByText(/ativo/i)).toBeInTheDocument();
    expect(screen.getByText(/6 ações configuradas/i)).toBeInTheDocument();
  });

  it("switches to the Settings tab when 'Configurar' is clicked on the banner", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === "/api/approval/settings")
        return Promise.resolve(jsonResponse(200, { message: "ok", data: settings({ approval_enabled: true }) }));
      return Promise.resolve(jsonResponse(200, { message: "ok", data: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen(root);
    await screen.findByRole("button", { name: /configurar/i });

    await user.click(screen.getByRole("button", { name: /configurar/i }));

    expect(await screen.findByText("Delete toggle")).toBeInTheDocument();
  });

  it("approves and executes a pending request, removing it from the Pending tab", async () => {
    let resolved = false;
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === "/api/approval/settings") return Promise.resolve(jsonResponse(200, { message: "ok", data: settings() }));
      if (path.endsWith("/approve") || path.endsWith("/execute")) {
        resolved = true;
        return Promise.resolve(jsonResponse(200, { message: "ok" }));
      }
      if (path === "/api/approval/requests/pending") return Promise.resolve(jsonResponse(200, { message: "ok", data: resolved ? [] : [request] }));
      return Promise.resolve(jsonResponse(200, { message: "ok", data: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen(root);
    await screen.findByText(/delete toggle/i);

    await user.click(screen.getByRole("button", { name: /aprovar/i }));

    expect(await screen.findByText(/tudo limpo/i)).toBeInTheDocument();
  });

  it("switches to the Mine tab, fetches /approval/requests/my, and shows the awaiting-review hint (never action buttons)", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === "/api/approval/settings") return Promise.resolve(jsonResponse(200, { message: "ok", data: settings() }));
      if (path === "/api/approval/requests/my") return Promise.resolve(jsonResponse(200, { message: "ok", data: [request] }));
      return Promise.resolve(jsonResponse(200, { message: "ok", data: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen(root);
    await screen.findByText(/tudo limpo/i);

    await user.click(screen.getByRole("button", { name: /^mine$/i }));

    expect(await screen.findByText(/delete toggle/i)).toBeInTheDocument();
    expect(screen.getByText(/aguardando revisão de um aprovador/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^approve$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /withdraw/i })).toBeInTheDocument();
  });

  it("withdraws a pending request from the Mine tab, clearing it from the list", async () => {
    let withdrawn = false;
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/approval/settings") return Promise.resolve(jsonResponse(200, { message: "ok", data: settings() }));
      if (path === "/api/approval/requests/1/withdraw" && init?.method === "POST") {
        withdrawn = true;
        return Promise.resolve(jsonResponse(200, { message: "ok" }));
      }
      if (path === "/api/approval/requests/my") return Promise.resolve(jsonResponse(200, { message: "ok", data: withdrawn ? [] : [request] }));
      return Promise.resolve(jsonResponse(200, { message: "ok", data: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen(root);
    await screen.findByText(/tudo limpo/i);
    await user.click(screen.getByRole("button", { name: /^mine$/i }));
    await screen.findByText(/delete toggle/i);

    await user.click(screen.getByRole("button", { name: /withdraw/i }));

    expect(fetchMock).toHaveBeenCalledWith("/api/approval/requests/1/withdraw", expect.objectContaining({ method: "POST" }));
    expect(await screen.findByText(/nenhum registro/i)).toBeInTheDocument();
  });

  it("saves an approval-settings change from the Settings tab", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/approval/settings" && init?.method === "PUT") {
        return Promise.resolve(jsonResponse(200, { message: "ok", data: settings({ approval_enabled: true }) }));
      }
      if (path === "/api/approval/settings") return Promise.resolve(jsonResponse(200, { message: "ok", data: settings() }));
      return Promise.resolve(jsonResponse(200, { message: "ok", data: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen(root);
    await screen.findByRole("button", { name: /configurar/i });
    await user.click(screen.getByRole("button", { name: /configurar/i }));
    await screen.findByText(/sistema.*desativado/i);

    await user.click(screen.getByRole("button", { name: /sistema de aprovação/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/approval/settings",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ approval_enabled: true }) })
    );
  });

  it("offers a retry when approve succeeds but execute fails", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === "/api/approval/settings") return Promise.resolve(jsonResponse(200, { message: "ok", data: settings() }));
      if (path.endsWith("/approve")) return Promise.resolve(jsonResponse(200, { message: "ok" }));
      if (path.endsWith("/execute")) return Promise.resolve(jsonResponse(500, { code: "T0005", message: "internal error" }));
      if (path === "/api/approval/requests/pending") return Promise.resolve(jsonResponse(200, { message: "ok", data: [request] }));
      return Promise.resolve(jsonResponse(200, { message: "ok", data: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen(root);
    await screen.findByText(/delete toggle/i);

    await user.click(screen.getByRole("button", { name: /aprovar/i }));

    expect(await screen.findByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("opens the reject modal and removes the request once rejected", async () => {
    let rejected = false;
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === "/api/approval/settings") return Promise.resolve(jsonResponse(200, { message: "ok", data: settings() }));
      if (path.endsWith("/reject")) {
        rejected = true;
        return Promise.resolve(jsonResponse(200, { message: "ok" }));
      }
      if (path === "/api/approval/requests/pending") return Promise.resolve(jsonResponse(200, { message: "ok", data: rejected ? [] : [request] }));
      return Promise.resolve(jsonResponse(200, { message: "ok", data: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen(root);
    await screen.findByText(/delete toggle/i);

    await user.click(screen.getByRole("button", { name: /rejeitar/i }));
    await screen.findByRole("button", { name: /confirmar rejeição/i });
    await user.click(screen.getByRole("button", { name: /confirmar rejeição/i }));

    expect(await screen.findByText(/tudo limpo/i)).toBeInTheDocument();
  });
});
