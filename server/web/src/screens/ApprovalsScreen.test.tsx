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
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { message: "ok", data: [] }));
    vi.stubGlobal("fetch", fetchMock);

    renderScreen(admin);

    await screen.findByText(/tudo limpo/i);
    expect(fetchMock).toHaveBeenCalledWith("/api/approval/requests/approvable", expect.anything());
    expect(screen.queryByRole("button", { name: /configurar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^settings$/i })).not.toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: /approve/i }));

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

    await user.click(screen.getByRole("button", { name: /approve/i }));

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

    await user.click(screen.getByRole("button", { name: /reject/i }));
    await screen.findByRole("button", { name: /confirmar rejeição/i });
    await user.click(screen.getByRole("button", { name: /confirmar rejeição/i }));

    expect(await screen.findByText(/tudo limpo/i)).toBeInTheDocument();
  });
});
