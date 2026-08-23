import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserManagementScreen } from "./UserManagementScreen";
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
    <MemoryRouter initialEntries={["/user-management"]}>
      <Routes>
        <Route element={<FakeShell user={user} />}>
          <Route path="/user-management" element={<UserManagementScreen />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("UserManagementScreen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists every user returned by the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          success: true,
          users: [
            { id: "1", username: "root", role: "root", must_change_password: false, created_at: "", updated_at: "" },
            { id: "2", username: "bob", role: "admin", must_change_password: false, created_at: "", updated_at: "" },
          ],
        })
      )
    );

    renderScreen();

    expect(await screen.findByText("root")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
  });

  it("shows an empty state when there are no users besides the caller", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, users: [] })));

    renderScreen();

    expect(await screen.findByText(/nenhum usuário/i)).toBeInTheDocument();
  });

  it("creates a user, shows the one-time password modal, and adds them to the list", async () => {
    let created = false;
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/users" && init?.method === "POST") {
        created = true;
        return Promise.resolve(
          jsonResponse(201, {
            success: true,
            user: { id: "2", username: "bob", role: "user", must_change_password: true, created_at: "", updated_at: "" },
            password: "Xk9$mQ2pLw#T",
          })
        );
      }
      const users = [{ id: "1", username: "root", role: "root", must_change_password: false, created_at: "", updated_at: "" }];
      if (created) users.push({ id: "2", username: "bob", role: "user", must_change_password: true, created_at: "", updated_at: "" });
      return Promise.resolve(jsonResponse(200, { success: true, users }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("root");

    await user.click(screen.getByRole("button", { name: /new user/i }));
    await user.type(screen.getByLabelText(/username/i), "bob");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    expect(await screen.findByText("Xk9$mQ2pLw#T")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /done/i }));

    expect(screen.getByText("bob")).toBeInTheDocument();
  });

  it("changes a user's role", async () => {
    let bobRole: "user" | "admin" = "user";
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/users/2" && init?.method === "PUT") {
        bobRole = "admin";
        return Promise.resolve(
          jsonResponse(200, {
            success: true,
            message: "User updated successfully",
            user: { id: "2", username: "bob", role: bobRole, must_change_password: false, created_at: "", updated_at: "" },
          })
        );
      }
      return Promise.resolve(
        jsonResponse(200, {
          success: true,
          users: [
            { id: "1", username: "root", role: "root", must_change_password: false, created_at: "", updated_at: "" },
            { id: "2", username: "bob", role: bobRole, must_change_password: false, created_at: "", updated_at: "" },
          ],
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("bob");

    await user.selectOptions(screen.getByLabelText(/role for bob/i), "admin");

    expect(fetchMock).toHaveBeenCalledWith("/api/users/2", expect.objectContaining({ method: "PUT", body: JSON.stringify({ role: "admin" }) }));
    await vi.waitFor(() => expect(screen.getByLabelText(/role for bob/i)).toHaveValue("admin"));
  });

  it("deletes a user via the confirm modal and removes them from the list", async () => {
    let deleted = false;
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/users/2" && init?.method === "DELETE") {
        deleted = true;
        return Promise.resolve(jsonResponse(200, { success: true, message: "User deleted successfully" }));
      }
      return Promise.resolve(
        jsonResponse(200, {
          success: true,
          users: deleted
            ? [{ id: "1", username: "root", role: "root", must_change_password: false, created_at: "", updated_at: "" }]
            : [
                { id: "1", username: "root", role: "root", must_change_password: false, created_at: "", updated_at: "" },
                { id: "2", username: "bob", role: "user", must_change_password: false, created_at: "", updated_at: "" },
              ],
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("bob");

    await user.click(screen.getByRole("button", { name: /delete user/i }));
    await screen.findByText(/delete user/i, { selector: ".modal-title" });
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    await vi.waitFor(() => expect(screen.queryByText("bob")).not.toBeInTheDocument());
    expect(deleted).toBe(true);
  });
});
