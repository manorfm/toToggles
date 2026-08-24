import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationsScreen } from "./ApplicationsScreen";
import type { AuthenticatedUser } from "../types/auth";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Simula o Outlet context que AppShell fornece de verdade (ver useAppUser).
function FakeShell({ user }: { user: AuthenticatedUser }) {
  return <Outlet context={{ user }} />;
}

function renderScreen(user: AuthenticatedUser = { id: "1", username: "root", role: "root", must_change_password: false }) {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route element={<FakeShell user={user} />}>
          <Route path="/" element={<ApplicationsScreen />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

const admin: AuthenticatedUser = { id: "2", username: "alice", role: "admin", must_change_password: false };
const readOnlyUser: AuthenticatedUser = { id: "3", username: "bob", role: "user", must_change_password: false };

describe("ApplicationsScreen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders every application returned by the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, [
          { id: "1", name: "Checkout Web", created_at: "", updated_at: "", toggles_total: 12, toggles_enabled: 9, toggles_disabled: 3 },
          { id: "2", name: "Mobile App", created_at: "", updated_at: "", toggles_total: 4, toggles_enabled: 1, toggles_disabled: 3 },
        ])
      )
    );

    renderScreen();

    expect(await screen.findByText("Checkout Web")).toBeInTheDocument();
    expect(screen.getByText("Mobile App")).toBeInTheDocument();
  });

  it("shows an empty state when there are no applications", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, [])));

    renderScreen();

    expect(await screen.findByText(/no applications yet/i)).toBeInTheDocument();
  });

  it("shows the API's error message when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, { code: "T0005", message: "internal error" })));

    renderScreen();

    expect(await screen.findByText(/internal error/i)).toBeInTheDocument();
  });

  it("shows 'New application' for root and admin, but not for read-only users", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(200, []))));

    const { unmount } = renderScreen(admin);
    await screen.findByText(/no applications yet/i);
    expect(screen.getByRole("button", { name: /new application/i })).toBeInTheDocument();
    unmount();

    renderScreen(readOnlyUser);
    await screen.findByText(/no applications yet/i);
    expect(screen.queryByRole("button", { name: /new application/i })).not.toBeInTheDocument();
  });

  it("adds the created application to the list without a full reload", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/teams") return Promise.resolve(jsonResponse(200, { success: true, teams: [{ id: "t1", name: "Payments Squad" }] }));
      if (path === "/api/applications" && init?.method === "POST") {
        return Promise.resolve(jsonResponse(201, { id: "9", name: "Checkout Web", created_at: "", updated_at: "" }));
      }
      return Promise.resolve(jsonResponse(200, []));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText(/no applications yet/i);

    await user.click(screen.getByRole("button", { name: /new application/i }));
    await user.type(screen.getByLabelText(/application name/i), "Checkout Web");
    await user.click(screen.getByRole("button", { name: /create application/i }));

    expect(await screen.findByText("Checkout Web")).toBeInTheDocument();
  });

  it("shows a pending-approval notice instead of adding a phantom application", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/teams") return Promise.resolve(jsonResponse(200, { success: true, teams: [{ id: "t1", name: "Payments Squad" }] }));
      if (path === "/api/applications" && init?.method === "POST") {
        return Promise.resolve(jsonResponse(202, { approval_required: true, action_type: "application_create" }));
      }
      return Promise.resolve(jsonResponse(200, []));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText(/no applications yet/i);

    await user.click(screen.getByRole("button", { name: /new application/i }));
    await user.type(screen.getByLabelText(/application name/i), "Checkout Web");
    await user.click(screen.getByRole("button", { name: /create application/i }));

    expect(await screen.findByText(/aguardando aprovação/i)).toBeInTheDocument();
    expect(screen.queryByText("Checkout Web")).not.toBeInTheDocument();
  });

  it("edits an application's name in place via the card's edit button", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/applications/1" && init?.method === "PUT") {
        return Promise.resolve(jsonResponse(200, { id: "1", name: "Checkout Web v2", created_at: "", updated_at: "" }));
      }
      return Promise.resolve(
        jsonResponse(200, [{ id: "1", name: "Checkout Web", created_at: "", updated_at: "", toggles_total: 12, toggles_enabled: 9, toggles_disabled: 3 }])
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("Checkout Web");

    await user.click(screen.getByRole("button", { name: /edit application/i }));
    await user.clear(screen.getByLabelText(/application name/i));
    await user.type(screen.getByLabelText(/application name/i), "Checkout Web v2");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("Checkout Web v2")).toBeInTheDocument();
    expect(screen.queryByText("Checkout Web", { exact: true })).not.toBeInTheDocument();
  });

  it("deletes an application from the edit modal's delete button, for root", async () => {
    let deleted = false;
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/applications/1" && init?.method === "DELETE") {
        deleted = true;
        return Promise.resolve(jsonResponse(200, { message: "application deleted successfully" }));
      }
      return Promise.resolve(
        jsonResponse(200, deleted ? [] : [{ id: "1", name: "Checkout Web", created_at: "", updated_at: "", toggles_total: 0, toggles_enabled: 0, toggles_disabled: 0 }])
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("Checkout Web");

    await user.click(screen.getByRole("button", { name: /edit application/i }));
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await screen.findByText(/delete application/i, { selector: ".modal-title" });
    await user.click(screen.getAllByRole("button", { name: /^delete$/i })[0]);

    await screen.findByText("No applications yet");
    expect(deleted).toBe(true);
  });

  it("does not show a delete option in the edit modal for a non-root admin", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, [{ id: "1", name: "Checkout Web", created_at: "", updated_at: "", toggles_total: 0, toggles_enabled: 0, toggles_disabled: 0 }])
      )
    );
    const user = userEvent.setup();

    renderScreen(admin);
    await screen.findByText("Checkout Web");

    await user.click(screen.getByRole("button", { name: /edit application/i }));

    expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
  });
});
