import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationDetailScreen } from "./ApplicationDetailScreen";
import { ToastProvider } from "../components/ToastProvider";
import type { AuthenticatedUser } from "../types/auth";
import type { ToggleDetail, ToggleNode } from "../types/toggle";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function FakeShell({ user }: { user: AuthenticatedUser }) {
  return <Outlet context={{ user, setOpenApp: () => {} }} />;
}

function renderScreen(user: AuthenticatedUser = { id: "1", username: "root", role: "root", must_change_password: false }) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/applications/app1"]}>
        <Routes>
          <Route element={<FakeShell user={user} />}>
            <Route path="/" element={<div>Applications list</div>} />
            <Route path="/applications/:id" element={<ApplicationDetailScreen />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );
}

function detail(overrides: Partial<ToggleDetail> & { id: string; value: string; enabled: boolean }): ToggleDetail {
  return {
    path: overrides.value,
    level: 0,
    parent_id: null,
    app_id: "app1",
    has_activation_rule: false,
    activation_rule: null,
    ...overrides,
  };
}

// A GET plana (sem ?hierarchy=true) devolve o próprio bit (não cascateado) de cada nó — nestas
// fixtures nenhum cenário testa um ancestral desligado bloqueando um filho ligado, então o bit
// próprio é sempre igual ao `enabled` já cascateado que os testes escrevem na árvore.
function flatten(nodes: ToggleNode[]): ToggleDetail[] {
  const out: ToggleDetail[] = [];
  function walk(list: ToggleNode[]) {
    for (const node of list) {
      out.push(detail({ id: node.id, value: node.value, enabled: node.enabled }));
      if (node.toggles) walk(node.toggles);
    }
  }
  walk(nodes);
  return out;
}

// Rota real: GET .../toggles?hierarchy=true (árvore) e GET .../toggles (plana, sem query) —
// distintas mas com o mesmo prefixo, por isso a ordem dos checks importa (query antes de exact).
function fetchMockFor(hierarchy: ToggleNode[] | undefined) {
  return vi.fn().mockImplementation((path: string) => {
    if (path === "/api/applications/app1") {
      return Promise.resolve(jsonResponse(200, { id: "app1", name: "Checkout Web", created_at: "", updated_at: "" }));
    }
    if (path.includes("hierarchy=true")) {
      return Promise.resolve(jsonResponse(200, { application: "app1", toggles: hierarchy }));
    }
    if (path === "/api/applications/app1/toggles") {
      return Promise.resolve(jsonResponse(200, flatten(hierarchy ?? [])));
    }
    return Promise.resolve(jsonResponse(200, {}));
  });
}

describe("ApplicationDetailScreen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the application name and one card per leaf toggle", async () => {
    vi.stubGlobal(
      "fetch",
      fetchMockFor([{ id: "1", value: "user", enabled: true, toggles: [{ id: "2", value: "payments", enabled: false }] }])
    );

    renderScreen();

    expect(await screen.findByText("Checkout Web")).toBeInTheDocument();
    // "user" is a branch node (has a child) — it must NOT get its own card, only appear as the
    // root chip + first path segment of the "user.payments" leaf card.
    expect(screen.getByText("user", { selector: ".root-chip" })).toBeInTheDocument();
    expect(screen.getByText("payments", { selector: ".seg-link" })).toBeInTheDocument();
  });

  it("shows the prototype's empty state when there are no toggles yet", async () => {
    vi.stubGlobal("fetch", fetchMockFor(undefined));

    renderScreen();

    expect(await screen.findByText("No toggles yet")).toBeInTheDocument();
    expect(screen.getByText("Create your first toggle path to get started.")).toBeInTheDocument();
  });

  it("flips a toggle and refreshes the grid on success", async () => {
    let flipped = false;
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/applications/app1") {
        return Promise.resolve(jsonResponse(200, { id: "app1", name: "Checkout Web", created_at: "", updated_at: "" }));
      }
      if (init?.method === "PUT") {
        flipped = true;
        return Promise.resolve(jsonResponse(200, { id: "1", enabled: false }));
      }
      if (path.includes("hierarchy=true")) {
        return Promise.resolve(jsonResponse(200, { application: "app1", toggles: [{ id: "1", value: "user", enabled: !flipped }] }));
      }
      if (path === "/api/applications/app1/toggles") {
        return Promise.resolve(jsonResponse(200, [detail({ id: "1", value: "user", enabled: !flipped })]));
      }
      return Promise.resolve(jsonResponse(200, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("user", { selector: ".root-chip" });
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByRole("switch"));

    await vi.waitFor(() => expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false"));
  });

  // v2.6 §4.2: toast(msg, {label:"Undo", onAction}) — a real API call re-applying the previous
  // state, not a client-side patch (this app persists to a real backend, unlike the prototype's
  // in-memory tree). Undo never goes through the approval-intercept guard, same as the confirmed
  // prototype (its own Undo closures never check requiresApproval either) — it's a direct,
  // fire-and-forget re-call of the mutating endpoint.
  it("shows an Undo action on the toast after flipping a toggle, which re-applies the previous state", async () => {
    let enabled = true;
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/applications/app1") {
        return Promise.resolve(jsonResponse(200, { id: "app1", name: "Checkout Web", created_at: "", updated_at: "" }));
      }
      if (path === "/api/applications/app1/toggle/1" && init?.method === "PUT") {
        enabled = JSON.parse(init.body as string).enabled;
        return Promise.resolve(jsonResponse(200, { id: "1", enabled }));
      }
      if (path.includes("hierarchy=true")) {
        return Promise.resolve(jsonResponse(200, { application: "app1", toggles: [{ id: "1", value: "user", enabled }] }));
      }
      if (path === "/api/applications/app1/toggles") {
        return Promise.resolve(jsonResponse(200, [detail({ id: "1", value: "user", enabled })]));
      }
      return Promise.resolve(jsonResponse(200, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("user", { selector: ".root-chip" });

    await user.click(screen.getByRole("switch"));
    await vi.waitFor(() => expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false"));

    await user.click(await screen.findByRole("button", { name: /undo/i }));

    await vi.waitFor(() => expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true"));
  });

  it("creates a toggle via the modal and shows it in the grid", async () => {
    let created = false;
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/applications/app1") {
        return Promise.resolve(jsonResponse(200, { id: "app1", name: "Checkout Web", created_at: "", updated_at: "" }));
      }
      if (init?.method === "POST") {
        created = true;
        return Promise.resolve(jsonResponse(201, { message: "toggle created successfully", path: "billing", enabled: true }));
      }
      if (path.includes("hierarchy=true")) {
        return Promise.resolve(
          jsonResponse(200, { application: "app1", toggles: created ? [{ id: "9", value: "billing", enabled: true }] : [] })
        );
      }
      if (path === "/api/applications/app1/toggles") {
        return Promise.resolve(jsonResponse(200, created ? [detail({ id: "9", value: "billing", enabled: true })] : []));
      }
      return Promise.resolve(jsonResponse(200, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("No toggles yet");

    await user.click(screen.getByRole("button", { name: /new toggle/i }));
    await user.type(screen.getByLabelText(/toggle path/i), "billing");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    expect(await screen.findByText("billing", { selector: ".root-chip" })).toBeInTheDocument();
  });

  it("configures an activation rule via the drawer opened from the card's Configure action", async () => {
    let ruleSet = false;
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/applications/app1") {
        return Promise.resolve(jsonResponse(200, { id: "app1", name: "Checkout Web", created_at: "", updated_at: "" }));
      }
      if (path === "/api/applications/app1/toggles/1" && init?.method === "PUT") {
        ruleSet = true;
        return Promise.resolve(
          jsonResponse(
            200,
            detail({ id: "1", value: "user", enabled: true, has_activation_rule: true, activation_rule: { type: "percentage", value: "25" } })
          )
        );
      }
      if (path === "/api/applications/app1/toggles/1") {
        return Promise.resolve(jsonResponse(200, detail({ id: "1", value: "user", enabled: true })));
      }
      if (path.includes("hierarchy=true")) {
        return Promise.resolve(jsonResponse(200, { application: "app1", toggles: [{ id: "1", value: "user", enabled: true }] }));
      }
      if (path === "/api/applications/app1/toggles") {
        return Promise.resolve(jsonResponse(200, [detail({ id: "1", value: "user", enabled: true, has_activation_rule: ruleSet })]));
      }
      return Promise.resolve(jsonResponse(200, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("user", { selector: ".root-chip" });

    await user.click(screen.getByRole("button", { name: /configure/i }));
    await screen.findByText("user", { selector: ".drawer-path" });

    await user.click(screen.getByRole("button", { name: /activation rule/i }));
    await user.click(screen.getByText("Percentage"));
    await user.type(screen.getByLabelText(/percentage value/i), "25");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await vi.waitFor(() => expect(ruleSet).toBe(true));
  });

  // v2.6 §4.3: rule-change undo re-saves the pre-edit snapshot (own enabled bit + activation
  // rule, read from the toggle as it was loaded — before any local edit) via the same
  // non-recursive endpoint, never going through the approval-intercept guard (see the comment on
  // the toggle-flip Undo test above for why).
  it("shows an Undo action after saving a rule change, which re-saves the pre-edit snapshot", async () => {
    let ruleSet = false;
    const puts: unknown[] = [];
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/applications/app1") {
        return Promise.resolve(jsonResponse(200, { id: "app1", name: "Checkout Web", created_at: "", updated_at: "" }));
      }
      if (path === "/api/applications/app1/toggles/1" && init?.method === "PUT") {
        puts.push(JSON.parse(init.body as string));
        ruleSet = puts.length === 1;
        return Promise.resolve(
          jsonResponse(200, detail({ id: "1", value: "user", enabled: true, has_activation_rule: ruleSet }))
        );
      }
      if (path === "/api/applications/app1/toggles/1") {
        return Promise.resolve(jsonResponse(200, detail({ id: "1", value: "user", enabled: true, has_activation_rule: false })));
      }
      if (path.includes("hierarchy=true")) {
        return Promise.resolve(jsonResponse(200, { application: "app1", toggles: [{ id: "1", value: "user", enabled: true }] }));
      }
      if (path === "/api/applications/app1/toggles") {
        return Promise.resolve(jsonResponse(200, [detail({ id: "1", value: "user", enabled: true, has_activation_rule: ruleSet })]));
      }
      return Promise.resolve(jsonResponse(200, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("user", { selector: ".root-chip" });

    await user.click(screen.getByRole("button", { name: /configure/i }));
    await screen.findByText("user", { selector: ".drawer-path" });
    await user.click(screen.getByRole("button", { name: /activation rule/i }));
    await user.click(screen.getByText("Percentage"));
    await user.type(screen.getByLabelText(/percentage value/i), "25");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await vi.waitFor(() => expect(puts).toHaveLength(1));

    await user.click(await screen.findByRole("button", { name: /undo/i }));

    await vi.waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1]).toEqual({ enabled: true, has_activation_rule: false });
  });

  it("deletes a leaf toggle via the confirm modal and refreshes the grid", async () => {
    let deleted = false;
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/applications/app1") {
        return Promise.resolve(jsonResponse(200, { id: "app1", name: "Checkout Web", created_at: "", updated_at: "" }));
      }
      if (path === "/api/applications/app1/toggles/3" && init?.method === "DELETE") {
        deleted = true;
        return Promise.resolve(jsonResponse(200, { message: "toggle deleted successfully" }));
      }
      if (path.includes("hierarchy=true")) {
        return Promise.resolve(
          jsonResponse(200, { application: "app1", toggles: deleted ? [] : [{ id: "3", value: "billing", enabled: true }] })
        );
      }
      if (path === "/api/applications/app1/toggles") {
        return Promise.resolve(jsonResponse(200, deleted ? [] : [detail({ id: "3", value: "billing", enabled: true })]));
      }
      return Promise.resolve(jsonResponse(200, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("billing", { selector: ".root-chip" });

    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await screen.findByText(/delete toggle/i, { selector: ".modal-title" });
    await user.click(screen.getByRole("button", { name: /^delete toggle$/i }));

    await screen.findByText("No toggles yet");
    expect(deleted).toBe(true);
  });

  // v2.6 §4.1/4.2: delete's Undo calls the restore endpoint directly (never the approval guard —
  // restore isn't approval-aware server-side either, see docs/rest-flow.md §7).
  it("shows an Undo action after deleting a toggle, which restores it via the restore endpoint", async () => {
    let deleted = false;
    let restored = false;
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/applications/app1") {
        return Promise.resolve(jsonResponse(200, { id: "app1", name: "Checkout Web", created_at: "", updated_at: "" }));
      }
      if (path === "/api/applications/app1/toggles/3" && init?.method === "DELETE") {
        deleted = true;
        return Promise.resolve(jsonResponse(200, { message: "toggle deleted successfully" }));
      }
      if (path === "/api/applications/app1/toggles/3/restore" && init?.method === "POST") {
        restored = true;
        return Promise.resolve(jsonResponse(200, { message: "toggle restored successfully", id: "3" }));
      }
      const gone = deleted && !restored;
      if (path.includes("hierarchy=true")) {
        return Promise.resolve(jsonResponse(200, { application: "app1", toggles: gone ? [] : [{ id: "3", value: "billing", enabled: true }] }));
      }
      if (path === "/api/applications/app1/toggles") {
        return Promise.resolve(jsonResponse(200, gone ? [] : [detail({ id: "3", value: "billing", enabled: true })]));
      }
      return Promise.resolve(jsonResponse(200, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("billing", { selector: ".root-chip" });

    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await screen.findByText(/delete toggle/i, { selector: ".modal-title" });
    await user.click(screen.getByRole("button", { name: /^delete toggle$/i }));
    await screen.findByText("No toggles yet");

    await user.click(await screen.findByRole("button", { name: /undo/i }));

    await screen.findByText("billing", { selector: ".root-chip" });
    expect(restored).toBe(true);
  });

  it("shows which path is currently serving traffic in the delete confirmation, when the leaf is on", async () => {
    vi.stubGlobal(
      "fetch",
      fetchMockFor([{ id: "3", value: "billing", enabled: true }])
    );
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("billing", { selector: ".root-chip" });

    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    expect(await screen.findByText(/currently serving traffic on/i)).toBeInTheDocument();
    expect(screen.getByText("billing", { selector: ".confirm-info code" })).toBeInTheDocument();
  });

  it("omits the traffic notice in the delete confirmation when the leaf is already off", async () => {
    vi.stubGlobal(
      "fetch",
      fetchMockFor([{ id: "3", value: "billing", enabled: false }])
    );
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("billing", { selector: ".root-chip" });

    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await screen.findByText(/delete toggle/i, { selector: ".modal-title" });

    expect(screen.queryByText(/currently serving traffic on/i)).not.toBeInTheDocument();
  });

  it("shows a pending-approval notice instead of removing the toggle when delete is intercepted", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/applications/app1") {
        return Promise.resolve(jsonResponse(200, { id: "app1", name: "Checkout Web", created_at: "", updated_at: "" }));
      }
      if (path === "/api/applications/app1/toggles/3" && init?.method === "DELETE") {
        return Promise.resolve(jsonResponse(202, { approval_required: true, action_type: "toggle_delete" }));
      }
      if (path.includes("hierarchy=true")) {
        return Promise.resolve(jsonResponse(200, { application: "app1", toggles: [{ id: "3", value: "billing", enabled: true }] }));
      }
      if (path === "/api/applications/app1/toggles") {
        return Promise.resolve(jsonResponse(200, [detail({ id: "3", value: "billing", enabled: true })]));
      }
      return Promise.resolve(jsonResponse(200, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("billing", { selector: ".root-chip" });

    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await screen.findByText(/delete toggle/i, { selector: ".modal-title" });
    await user.click(screen.getByRole("button", { name: /^delete toggle$/i }));

    expect(await screen.findByText(/aguardando aprova/i)).toBeInTheDocument();
    expect(screen.getByText("billing", { selector: ".root-chip" })).toBeInTheDocument();
  });

  it("shows a 'Delete application' action for root, deletes it and navigates back to the applications list", async () => {
    let deleted = false;
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/applications/app1" && init?.method === "DELETE") {
        deleted = true;
        return Promise.resolve(jsonResponse(200, { message: "application deleted successfully" }));
      }
      if (path === "/api/applications/app1") {
        return Promise.resolve(jsonResponse(200, { id: "app1", name: "Checkout Web", created_at: "", updated_at: "" }));
      }
      if (path.includes("hierarchy=true")) return Promise.resolve(jsonResponse(200, { application: "app1", toggles: [] }));
      if (path === "/api/applications/app1/toggles") return Promise.resolve(jsonResponse(200, []));
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

  it("shows the approval intercept before flipping a toggle, for a non-root admin, then applies it on confirm", async () => {
    let flipped = false;
    const admin: AuthenticatedUser = { id: "2", username: "alice", role: "admin", must_change_password: false };
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/applications/app1") {
        return Promise.resolve(jsonResponse(200, { id: "app1", name: "Checkout Web", created_at: "", updated_at: "" }));
      }
      if (path === "/api/approval/required?action_type=toggle_disable") return Promise.resolve(jsonResponse(200, { data: { required: true } }));
      if (init?.method === "PUT") {
        flipped = true;
        return Promise.resolve(jsonResponse(200, { id: "1", enabled: false }));
      }
      if (path.includes("hierarchy=true")) {
        return Promise.resolve(jsonResponse(200, { application: "app1", toggles: [{ id: "1", value: "user", enabled: !flipped }] }));
      }
      if (path === "/api/applications/app1/toggles") {
        return Promise.resolve(jsonResponse(200, [detail({ id: "1", value: "user", enabled: !flipped })]));
      }
      return Promise.resolve(jsonResponse(200, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen(admin);
    await screen.findByText("user", { selector: ".root-chip" });

    await user.click(screen.getByRole("switch"));

    expect(await screen.findByText(/approval required/i)).toBeInTheDocument();
    expect(screen.getByText("user", { selector: ".aic-val" })).toBeInTheDocument();
    expect(flipped).toBe(false);

    await user.click(screen.getByRole("button", { name: /send for approval/i }));

    await vi.waitFor(() => expect(flipped).toBe(true));
  });

  it("shows the approval intercept before deleting a leaf toggle, for a non-root admin", async () => {
    const admin: AuthenticatedUser = { id: "2", username: "alice", role: "admin", must_change_password: false };
    let deleted = false;
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/applications/app1") {
        return Promise.resolve(jsonResponse(200, { id: "app1", name: "Checkout Web", created_at: "", updated_at: "" }));
      }
      if (path === "/api/approval/required?action_type=toggle_delete") return Promise.resolve(jsonResponse(200, { data: { required: true } }));
      if (path === "/api/applications/app1/toggles/3" && init?.method === "DELETE") {
        deleted = true;
        return Promise.resolve(jsonResponse(200, { message: "toggle deleted successfully" }));
      }
      if (path.includes("hierarchy=true")) {
        return Promise.resolve(
          jsonResponse(200, { application: "app1", toggles: deleted ? [] : [{ id: "3", value: "billing", enabled: true }] })
        );
      }
      if (path === "/api/applications/app1/toggles") {
        return Promise.resolve(jsonResponse(200, deleted ? [] : [detail({ id: "3", value: "billing", enabled: true })]));
      }
      return Promise.resolve(jsonResponse(200, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen(admin);
    await screen.findByText("billing", { selector: ".root-chip" });

    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await screen.findByText(/delete toggle/i, { selector: ".modal-title" });
    await user.click(screen.getByRole("button", { name: /^delete toggle$/i }));

    expect(await screen.findByText(/approval required/i)).toBeInTheDocument();
    expect(deleted).toBe(false);

    await user.click(screen.getByRole("button", { name: /send for approval/i }));

    await vi.waitFor(() => expect(deleted).toBe(true));
  });

  it("does not show 'Delete application' for a non-root admin", async () => {
    vi.stubGlobal("fetch", fetchMockFor([]));

    renderScreen({ id: "2", username: "admin", role: "admin", must_change_password: false });
    await screen.findByText("Checkout Web");

    expect(screen.queryByRole("button", { name: /delete application/i })).not.toBeInTheDocument();
  });

  // v2.6 §4.1: "Archived (N)" button next to "New toggle", shown only when there's something
  // archived; opens ArchivedModal, whose Restore stays open and live-refreshes its own list
  // instead of closing (confirmed prototype: restoreArchived filters the entry out of `archived`
  // in place, the modal keeps rendering).
  function fetchMockWithArchived(archivedInitially: boolean) {
    let restored = !archivedInitially;
    return vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/applications/app1") {
        return Promise.resolve(jsonResponse(200, { id: "app1", name: "Checkout Web", created_at: "", updated_at: "" }));
      }
      if (path === "/api/applications/app1/toggles/9/restore" && init?.method === "POST") {
        restored = true;
        return Promise.resolve(jsonResponse(200, { message: "toggle restored successfully", id: "9" }));
      }
      if (path === "/api/applications/app1/toggles/archived") {
        return Promise.resolve(
          jsonResponse(
            200,
            restored
              ? { message: "archived toggles retrieved successfully" }
              : {
                  message: "archived toggles retrieved successfully",
                  toggles: [{ id: "9", path: "payments.card", deleted_at: "2026-09-03T12:00:00Z", deleted_by_name: "alice" }],
                }
          )
        );
      }
      if (path.includes("hierarchy=true")) {
        return Promise.resolve(jsonResponse(200, { application: "app1", toggles: [] }));
      }
      if (path === "/api/applications/app1/toggles") {
        return Promise.resolve(jsonResponse(200, []));
      }
      return Promise.resolve(jsonResponse(200, {}));
    });
  }

  it("shows an 'Archived (N)' button when the application has archived toggles, for a canEdit role", async () => {
    vi.stubGlobal("fetch", fetchMockWithArchived(true));

    renderScreen();

    expect(await screen.findByRole("button", { name: /archived \(1\)/i })).toBeInTheDocument();
  });

  it("hides the 'Archived' button when there's nothing archived", async () => {
    vi.stubGlobal("fetch", fetchMockWithArchived(false));

    renderScreen();
    await screen.findByText("No toggles yet");

    expect(screen.queryByRole("button", { name: /archived/i })).not.toBeInTheDocument();
  });

  it("opens the Archived modal and restores an entry without closing the modal", async () => {
    vi.stubGlobal("fetch", fetchMockWithArchived(true));
    const user = userEvent.setup();

    renderScreen();
    await user.click(await screen.findByRole("button", { name: /archived \(1\)/i }));

    expect(await screen.findByText("payments.card")).toBeInTheDocument();
    expect(screen.getByText(/deleted by alice/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /restore/i }));

    await screen.findByText("Nothing archived.");
    expect(screen.getByText("Archived toggles")).toBeInTheDocument();
  });
});
