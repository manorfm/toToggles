import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Outlet } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApprovalsScreen } from "./ApprovalsScreen";
import type { AuthenticatedUser } from "../types/auth";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function FakeShell({ user }: { user: AuthenticatedUser }) {
  return <Outlet context={{ user }} />;
}

// Reaproveita o padrão de outlet context dos outros testes de tela, sem depender de
// react-router-dom's testing utils diretamente (ApprovalsScreen não usa rota própria).
import { MemoryRouter, Route, Routes } from "react-router-dom";
function renderScreen(user: AuthenticatedUser) {
  return render(
    <MemoryRouter initialEntries={["/approvals"]}>
      <Routes>
        <Route element={<FakeShell user={user} />}>
          <Route path="/approvals" element={<ApprovalsScreen />} />
        </Route>
      </Routes>
    </MemoryRouter>
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

describe("ApprovalsScreen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches /approval/requests/pending for root", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { message: "ok", data: [] }));
    vi.stubGlobal("fetch", fetchMock);

    renderScreen(root);

    await screen.findByText(/nenhuma solicitação/i);
    expect(fetchMock).toHaveBeenCalledWith("/approval/requests/pending", expect.anything());
  });

  it("fetches /approval/requests/approvable for non-root", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { message: "ok", data: [] }));
    vi.stubGlobal("fetch", fetchMock);

    renderScreen(admin);

    await screen.findByText(/nenhuma solicitação/i);
    expect(fetchMock).toHaveBeenCalledWith("/approval/requests/approvable", expect.anything());
  });

  it("approves and executes, removing the request from the list", async () => {
    let resolved = false;
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path.endsWith("/approve") || path.endsWith("/execute")) {
        resolved = true;
        return Promise.resolve(jsonResponse(200, { message: "ok" }));
      }
      return Promise.resolve(jsonResponse(200, { message: "ok", data: resolved ? [] : [request] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen(root);
    await screen.findByText(/delete toggle/i);

    await user.click(screen.getByRole("button", { name: /approve/i }));

    expect(await screen.findByText(/nenhuma solicitação/i)).toBeInTheDocument();
  });

  it("offers a retry when approve succeeds but execute fails", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path.endsWith("/approve")) return Promise.resolve(jsonResponse(200, { message: "ok" }));
      if (path.endsWith("/execute")) return Promise.resolve(jsonResponse(500, { code: "T0005", message: "internal error" }));
      return Promise.resolve(jsonResponse(200, { message: "ok", data: [request] }));
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
      if (path.endsWith("/reject")) {
        rejected = true;
        return Promise.resolve(jsonResponse(200, { message: "ok" }));
      }
      return Promise.resolve(jsonResponse(200, { message: "ok", data: rejected ? [] : [request] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen(root);
    await screen.findByText(/delete toggle/i);

    await user.click(screen.getByRole("button", { name: /reject/i }));
    await screen.findByRole("button", { name: /confirmar rejeição/i });
    await user.click(screen.getByRole("button", { name: /confirmar rejeição/i }));

    expect(await screen.findByText(/nenhuma solicitação/i)).toBeInTheDocument();
  });
});
