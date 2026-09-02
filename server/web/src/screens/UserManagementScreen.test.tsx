import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserManagementScreen } from "./UserManagementScreen";
import { ToastProvider } from "../components/ToastProvider";
import type { AuthenticatedUser } from "../types/auth";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const root: AuthenticatedUser = { id: "1", username: "root", role: "root", must_change_password: false };

function FakeShell({ user }: { user: AuthenticatedUser }) {
  return <Outlet context={{ user }} />;
}

function renderScreen(user: AuthenticatedUser = root) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/users"]}>
        <Routes>
          <Route element={<FakeShell user={user} />}>
            <Route path="/users" element={<UserManagementScreen />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );
}

function rootFixture() {
  return { id: "1", name: "Root", username: "root", role: "root", must_change_password: false, active: true, status: "active", teams: [], created_at: "", updated_at: "" };
}

function bobFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "2",
    name: "Bob Test",
    username: "bob",
    role: "user",
    must_change_password: false,
    active: true,
    status: "active",
    teams: [{ id: "t1", name: "Payments Squad" }],
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("UserManagementScreen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists every user returned by the API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, users: [rootFixture(), bobFixture()] })));

    renderScreen();

    expect(await screen.findByText("@root")).toBeInTheDocument();
    expect(screen.getByText("@bob")).toBeInTheDocument();
  });

  it("shows an empty state when there are no users besides the caller", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, users: [] })));

    renderScreen();

    expect(await screen.findByText(/nenhum usuário encontrado/i)).toBeInTheDocument();
  });

  it("filters the list by username in the search box", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, users: [rootFixture(), bobFixture()] })));
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("@bob");

    await user.type(screen.getByPlaceholderText(/buscar por nome ou username/i), "bob");

    expect(screen.getByText("@bob")).toBeInTheDocument();
    expect(screen.queryByText("@root")).not.toBeInTheDocument();
  });

  // Confirmado no protótipo real (get_screen_full("UsersView")): o placeholder diz "Buscar por
  // nome ou username", mas o filtro só olhava username — gap real, não só de texto.
  it("also filters the list by display name in the search box", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, users: [rootFixture(), bobFixture()] })));
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("@bob");

    await user.type(screen.getByPlaceholderText(/buscar por nome ou username/i), bobFixture().name);

    expect(screen.getByText("@bob")).toBeInTheDocument();
    expect(screen.queryByText("@root")).not.toBeInTheDocument();
  });

  it("shows a badge counting users still on their temporary password", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, { success: true, users: [rootFixture(), bobFixture({ status: "pending_first_login" })] }))
    );

    renderScreen();

    expect(await screen.findByText("1 aguardando 1º acesso")).toBeInTheDocument();
  });

  it("creates a user, shows the one-time password modal, and adds them to the list", async () => {
    let created = false;
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/teams") return Promise.resolve(jsonResponse(200, { success: true, teams: [{ id: "t1", name: "Payments Squad" }] }));
      if (path === "/api/users" && init?.method === "POST") {
        created = true;
        return Promise.resolve(jsonResponse(201, { success: true, user: bobFixture({ status: "pending_first_login" }), password: "Xk9$mQ2pLw#T" }));
      }
      const users = created ? [rootFixture(), bobFixture({ status: "pending_first_login" })] : [rootFixture()];
      return Promise.resolve(jsonResponse(200, { success: true, users }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("@root");

    await user.click(screen.getByRole("button", { name: /criar usuário/i }));
    await screen.findByRole("option", { name: "Payments Squad" });
    await user.type(screen.getByLabelText(/nome completo/i), "Bob Test");
    await user.clear(screen.getByLabelText(/^username$/i));
    await user.type(screen.getByLabelText(/^username$/i), "bob");
    await user.click(screen.getAllByRole("button", { name: /^criar usuário$/i })[1]);

    expect(await screen.findByText("Xk9$mQ2pLw#T")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /entendi/i }));

    expect(screen.getByText("@bob")).toBeInTheDocument();
  });

  it("resets a user's password from the row and shows the new one-time password", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/users/2/reset-password" && init?.method === "POST") {
        return Promise.resolve(jsonResponse(200, { success: true, user: bobFixture({ status: "pending_first_login" }), password: "Nq7!vRxK2pLm" }));
      }
      return Promise.resolve(jsonResponse(200, { success: true, users: [rootFixture(), bobFixture()] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("@bob");

    await user.click(screen.getByRole("button", { name: /resetar senha/i }));

    expect(await screen.findByText("Senha provisória redefinida")).toBeInTheDocument();
    expect(screen.getByText("Nq7!vRxK2pLm")).toBeInTheDocument();
  });

  it("toggles a user's status (disable/reactivate) from the row", async () => {
    let active = true;
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/users/2/status" && init?.method === "PUT") {
        active = JSON.parse(init.body as string).active;
        return Promise.resolve(jsonResponse(200, { success: true, user: bobFixture({ active, status: active ? "active" : "disabled" }) }));
      }
      return Promise.resolve(jsonResponse(200, { success: true, users: [rootFixture(), bobFixture({ active, status: active ? "active" : "disabled" })] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("@bob");

    await user.click(screen.getByRole("button", { name: /desativar/i }));

    await vi.waitFor(() => expect(screen.getByText("Desativado")).toBeInTheDocument());
  });

  it("deletes a user via the confirm modal and removes them from the list (root only)", async () => {
    let deleted = false;
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/users/2" && init?.method === "DELETE") {
        deleted = true;
        return Promise.resolve(jsonResponse(200, { success: true, message: "User deleted successfully" }));
      }
      return Promise.resolve(jsonResponse(200, { success: true, users: deleted ? [rootFixture()] : [rootFixture(), bobFixture()] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("@bob");

    await user.click(screen.getByRole("button", { name: /excluir usuário/i }));
    await screen.findByText(/delete user/i, { selector: ".modal-title" });
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    await vi.waitFor(() => expect(screen.queryByText("@bob")).not.toBeInTheDocument());
    expect(deleted).toBe(true);
  });

  it("does not show manage actions on the caller's own row", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, users: [rootFixture(), bobFixture()] })));

    renderScreen();
    await screen.findByText("@root");

    const rows = screen.getAllByText(/^@/);
    expect(rows).toHaveLength(2);
    // Only bob's row should offer manage actions — root's own row shows none.
    expect(screen.getAllByRole("button", { name: /resetar senha/i })).toHaveLength(1);
  });
});
