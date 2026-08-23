import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationDetailScreen } from "./ApplicationDetailScreen";
import type { AuthenticatedUser } from "../types/auth";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function FakeShell({ user }: { user: AuthenticatedUser }) {
  return <Outlet context={{ user }} />;
}

function renderScreen(user: AuthenticatedUser = { id: "1", username: "root", role: "root", must_change_password: false }) {
  return render(
    <MemoryRouter initialEntries={["/applications/app1"]}>
      <Routes>
        <Route element={<FakeShell user={user} />}>
          <Route path="/" element={<div>Applications list</div>} />
          <Route path="/applications/:id" element={<ApplicationDetailScreen />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

function fetchMockFor(hierarchy: unknown) {
  return vi.fn().mockImplementation((path: string) => {
    if (path === "/api/applications/app1") return Promise.resolve(jsonResponse(200, { id: "app1", name: "Checkout Web", created_at: "", updated_at: "" }));
    if (path.startsWith("/api/applications/app1/toggles")) return Promise.resolve(jsonResponse(200, { application: "app1", toggles: hierarchy }));
    return Promise.resolve(jsonResponse(200, {}));
  });
}

describe("ApplicationDetailScreen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the application name and the toggle tree", async () => {
    vi.stubGlobal("fetch", fetchMockFor([{ id: "1", value: "user", enabled: true, toggles: [{ id: "2", value: "payments", enabled: false }] }]));

    renderScreen();

    expect(await screen.findByText("Checkout Web")).toBeInTheDocument();
    expect(screen.getByText("user")).toBeInTheDocument();
    expect(screen.getByText("payments")).toBeInTheDocument();
  });

  it("shows an empty state when there are no toggles yet", async () => {
    vi.stubGlobal("fetch", fetchMockFor(undefined));

    renderScreen();

    expect(await screen.findByText(/nenhum toggle/i)).toBeInTheDocument();
  });

  it("flips a toggle and refreshes the tree on success", async () => {
    let flipped = false;
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/applications/app1") return Promise.resolve(jsonResponse(200, { id: "app1", name: "Checkout Web", created_at: "", updated_at: "" }));
      if (init?.method === "PUT") {
        flipped = true;
        return Promise.resolve(jsonResponse(200, { id: "1", enabled: false }));
      }
      if (path.startsWith("/api/applications/app1/toggles")) {
        return Promise.resolve(
          jsonResponse(200, { application: "app1", toggles: [{ id: "1", value: "user", enabled: !flipped }] })
        );
      }
      return Promise.resolve(jsonResponse(200, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("user");
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByRole("switch"));

    await vi.waitFor(() => expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false"));
  });

  it("creates a toggle via the modal and shows it in the tree", async () => {
    let created = false;
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/applications/app1") return Promise.resolve(jsonResponse(200, { id: "app1", name: "Checkout Web", created_at: "", updated_at: "" }));
      if (init?.method === "POST") {
        created = true;
        return Promise.resolve(jsonResponse(201, { message: "toggle created successfully", path: "billing", enabled: true }));
      }
      if (path.startsWith("/api/applications/app1/toggles")) {
        return Promise.resolve(
          jsonResponse(200, { application: "app1", toggles: created ? [{ id: "9", value: "billing", enabled: true }] : [] })
        );
      }
      return Promise.resolve(jsonResponse(200, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText(/nenhum toggle/i);

    await user.click(screen.getByRole("button", { name: /new toggle/i }));
    await user.type(screen.getByLabelText(/toggle path/i), "billing");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    expect(await screen.findByText("billing")).toBeInTheDocument();
  });

  it("configures an activation rule via the drawer and refreshes the tree", async () => {
    let ruleSet = false;
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/applications/app1") return Promise.resolve(jsonResponse(200, { id: "app1", name: "Checkout Web", created_at: "", updated_at: "" }));
      if (path === "/api/applications/app1/toggles/1" && init?.method === "PUT") {
        ruleSet = true;
        return Promise.resolve(
          jsonResponse(200, {
            id: "1",
            value: "user",
            enabled: true,
            path: "user",
            level: 0,
            parent_id: null,
            app_id: "app1",
            has_activation_rule: true,
            activation_rule: { type: "percentage", value: "25" },
          })
        );
      }
      if (path === "/api/applications/app1/toggles/1") {
        return Promise.resolve(
          jsonResponse(200, {
            id: "1",
            value: "user",
            enabled: true,
            path: "user",
            level: 0,
            parent_id: null,
            app_id: "app1",
            has_activation_rule: false,
            activation_rule: null,
          })
        );
      }
      if (path.startsWith("/api/applications/app1/toggles")) {
        return Promise.resolve(jsonResponse(200, { application: "app1", toggles: [{ id: "1", value: "user", enabled: true }] }));
      }
      return Promise.resolve(jsonResponse(200, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("user");

    await user.click(screen.getByRole("button", { name: /configure/i }));
    await screen.findByText("user", { selector: ".drawer-path" });

    await user.click(screen.getByRole("button", { name: /activation rule/i }));
    await user.click(screen.getByText("Percentage"));
    await user.type(screen.getByLabelText(/percentage value/i), "25");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await vi.waitFor(() => expect(ruleSet).toBe(true));
  });

  it("deletes a leaf toggle via the confirm modal and refreshes the tree", async () => {
    let deleted = false;
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/applications/app1") return Promise.resolve(jsonResponse(200, { id: "app1", name: "Checkout Web", created_at: "", updated_at: "" }));
      if (path === "/api/applications/app1/toggles/3" && init?.method === "DELETE") {
        deleted = true;
        return Promise.resolve(jsonResponse(200, { message: "toggle deleted successfully" }));
      }
      if (path.startsWith("/api/applications/app1/toggles")) {
        return Promise.resolve(
          jsonResponse(200, { application: "app1", toggles: deleted ? [] : [{ id: "3", value: "billing", enabled: true }] })
        );
      }
      return Promise.resolve(jsonResponse(200, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("billing");

    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await screen.findByText(/delete toggle/i);
    await user.click(screen.getAllByRole("button", { name: /^delete$/i })[1]);

    await screen.findByText(/nenhum toggle/i);
    expect(deleted).toBe(true);
  });

  it("shows a pending-approval notice instead of removing the toggle when delete is intercepted", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/applications/app1") return Promise.resolve(jsonResponse(200, { id: "app1", name: "Checkout Web", created_at: "", updated_at: "" }));
      if (path === "/api/applications/app1/toggles/3" && init?.method === "DELETE") {
        return Promise.resolve(jsonResponse(202, { approval_required: true, action_type: "toggle_delete" }));
      }
      if (path.startsWith("/api/applications/app1/toggles")) {
        return Promise.resolve(jsonResponse(200, { application: "app1", toggles: [{ id: "3", value: "billing", enabled: true }] }));
      }
      return Promise.resolve(jsonResponse(200, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("billing");

    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await screen.findByText(/delete toggle/i);
    await user.click(screen.getAllByRole("button", { name: /^delete$/i })[1]);

    expect(await screen.findByText(/aguardando aprova/i)).toBeInTheDocument();
    expect(screen.getByText("billing")).toBeInTheDocument();
  });

  it("shows a 'Delete application' action for root, deletes it and navigates back to the applications list", async () => {
    let deleted = false;
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/applications/app1" && init?.method === "DELETE") {
        deleted = true;
        return Promise.resolve(jsonResponse(200, { message: "application deleted successfully" }));
      }
      if (path === "/api/applications/app1") return Promise.resolve(jsonResponse(200, { id: "app1", name: "Checkout Web", created_at: "", updated_at: "" }));
      if (path.startsWith("/api/applications/app1/toggles")) return Promise.resolve(jsonResponse(200, { application: "app1", toggles: [] }));
      return Promise.resolve(jsonResponse(200, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("Checkout Web");

    await user.click(screen.getByRole("button", { name: /delete application/i }));
    await screen.findByText(/delete application/i, { selector: ".modal-title" });
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    await screen.findByText("Applications list");
    expect(deleted).toBe(true);
  });

  it("does not show 'Delete application' for a non-root admin", async () => {
    vi.stubGlobal("fetch", fetchMockFor([]));

    renderScreen({ id: "2", username: "admin", role: "admin", must_change_password: false });
    await screen.findByText("Checkout Web");

    expect(screen.queryByRole("button", { name: /delete application/i })).not.toBeInTheDocument();
  });
});
