import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TeamsScreen } from "./TeamsScreen";
import { ToastProvider } from "../components/ToastProvider";
import type { AuthenticatedUser } from "../types/auth";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Simula o Outlet context que AppShell fornece de verdade (ver useAppUser).
function FakeShell({ user }: { user: AuthenticatedUser }) {
  return <Outlet context={{ user }} />;
}

function renderScreen(user: AuthenticatedUser) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/teams"]}>
        <Routes>
          <Route element={<FakeShell user={user} />}>
            <Route path="/teams" element={<TeamsScreen />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );
}

const root: AuthenticatedUser = { id: "1", username: "root", role: "root", must_change_password: false };
const admin: AuthenticatedUser = { id: "2", username: "alice", role: "admin", must_change_password: false };

describe("TeamsScreen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders every team returned by the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          success: true,
          teams: [
            { id: "1", name: "Payments Squad", description: "", created_at: "", updated_at: "", user_count: 2, application_count: 1 },
          ],
        })
      )
    );

    renderScreen(root);

    expect(await screen.findByText("Payments Squad")).toBeInTheDocument();
  });

  it("shows an empty state when there are no teams", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, teams: [] })));

    renderScreen(root);

    expect(await screen.findByText(/nenhum time/i)).toBeInTheDocument();
  });

  it("shows 'New team' only for root, and opens the creation modal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, teams: [] })));
    const user = userEvent.setup();

    renderScreen(root);
    await screen.findByText(/nenhum time/i);

    await user.click(screen.getByRole("button", { name: /new team/i }));

    expect(screen.getByLabelText(/team name/i)).toBeInTheDocument();
  });

  it("does not show 'New team' for non-root users", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, teams: [] })));

    renderScreen(admin);

    await screen.findByText(/nenhum time/i);
    expect(screen.queryByRole("button", { name: /new team/i })).not.toBeInTheDocument();
  });

  it("adds the newly created team to the list without a full reload", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/teams" && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse(201, { success: true, team: { id: "9", name: "Data Platform", description: "", created_at: "", updated_at: "" } })
        );
      }
      return Promise.resolve(jsonResponse(200, { success: true, teams: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen(root);
    await screen.findByText(/nenhum time/i);

    await user.click(screen.getByRole("button", { name: /new team/i }));
    await user.type(screen.getByLabelText(/team name/i), "Data Platform");
    await user.click(screen.getByRole("button", { name: /create team/i }));

    expect(await screen.findByText("Data Platform")).toBeInTheDocument();
  });

  it("deletes a team via the confirm modal and removes it from the list", async () => {
    let deleted = false;
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/teams/1" && init?.method === "DELETE") {
        deleted = true;
        return Promise.resolve(jsonResponse(200, { success: true, message: "Team deleted successfully" }));
      }
      return Promise.resolve(
        jsonResponse(200, {
          success: true,
          teams: deleted
            ? []
            : [{ id: "1", name: "Payments Squad", description: "", created_at: "", updated_at: "", user_count: 0, application_count: 0 }],
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen(root);
    await screen.findByText("Payments Squad");

    await user.click(screen.getByRole("button", { name: /delete team/i }));
    await screen.findByText(/delete team/i, { selector: ".modal-title" });
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    await screen.findByText(/nenhum time/i);
    expect(deleted).toBe(true);
  });

  it("does not show delete buttons for non-root users", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          success: true,
          teams: [{ id: "1", name: "Payments Squad", description: "", created_at: "", updated_at: "", user_count: 0, application_count: 0 }],
        })
      )
    );

    renderScreen(admin);
    await screen.findByText("Payments Squad");

    expect(screen.queryByRole("button", { name: /delete team/i })).not.toBeInTheDocument();
  });
});
