import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppModal } from "./AppModal";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("AppModal — create mode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads team options and lets the user pick one before creating", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === "/api/teams") return Promise.resolve(jsonResponse(200, { success: true, teams: [{ id: "1", name: "Payments Squad" }] }));
      return Promise.resolve(jsonResponse(201, { id: "9", name: "Checkout Web", created_at: "", updated_at: "" }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const onCreated = vi.fn();
    const user = userEvent.setup();

    render(<AppModal isRoot onClose={vi.fn()} onCreated={onCreated} onUpdated={vi.fn()} onPendingApproval={vi.fn()} />);

    expect(await screen.findByRole("option", { name: "Payments Squad" })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/application name/i), "Checkout Web");
    await user.selectOptions(screen.getByLabelText(/team/i), "1");
    await user.click(screen.getByRole("button", { name: /create application/i }));

    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: "9", name: "Checkout Web" })));
  });

  it("shows a hint and disables submit when there are no team options", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, teams: [] })));

    render(<AppModal isRoot={false} onClose={vi.fn()} onCreated={vi.fn()} onUpdated={vi.fn()} onPendingApproval={vi.fn()} />);

    expect(await screen.findByText(/precisa estar em um time/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create application/i })).toBeDisabled();
  });

  it("calls onPendingApproval (not onCreated) when the API responds 202", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === "/api/teams") return Promise.resolve(jsonResponse(200, { success: true, teams: [{ id: "1", name: "Payments Squad" }] }));
      return Promise.resolve(jsonResponse(202, { approval_required: true, action_type: "application_create" }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const onCreated = vi.fn();
    const onPendingApproval = vi.fn();
    const user = userEvent.setup();

    render(<AppModal isRoot onClose={vi.fn()} onCreated={onCreated} onUpdated={vi.fn()} onPendingApproval={onPendingApproval} />);

    await screen.findByRole("option", { name: "Payments Squad" });
    await user.type(screen.getByLabelText(/application name/i), "Checkout Web");
    await user.click(screen.getByRole("button", { name: /create application/i }));

    await vi.waitFor(() => expect(onPendingApproval).toHaveBeenCalledWith("application_create"));
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("shows the server's error message without closing on a duplicate name", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/teams") return Promise.resolve(jsonResponse(200, { success: true, teams: [{ id: "1", name: "Payments Squad" }] }));
      if (init?.method === "POST") return Promise.resolve(jsonResponse(409, { code: "T0003", message: "application already exists" }));
      return Promise.resolve(jsonResponse(200, { success: true, teams: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<AppModal isRoot onClose={onClose} onCreated={vi.fn()} onUpdated={vi.fn()} onPendingApproval={vi.fn()} />);

    await screen.findByRole("option", { name: "Payments Squad" });
    await user.type(screen.getByLabelText(/application name/i), "Checkout Web");
    await user.click(screen.getByRole("button", { name: /create application/i }));

    expect(await screen.findByText(/application already exists/i)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows the approval intercept before creating, for a non-root caller, when the action requires approval", async () => {
    let created = false;
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === "/api/teams") return Promise.resolve(jsonResponse(200, { success: true, teams: [] }));
      if (path === "/api/profile/teams") return Promise.resolve(jsonResponse(200, { success: true, teams: [{ id: "1", name: "Payments Squad" }] }));
      if (path === "/api/approval/required?action_type=application_create") return Promise.resolve(jsonResponse(200, { data: { required: true } }));
      if (path === "/api/applications") {
        created = true;
        return Promise.resolve(jsonResponse(201, { id: "9", name: "Checkout Web", created_at: "", updated_at: "" }));
      }
      return Promise.resolve(jsonResponse(200, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const onCreated = vi.fn();
    const user = userEvent.setup();

    render(<AppModal isRoot={false} onClose={vi.fn()} onCreated={onCreated} onUpdated={vi.fn()} onPendingApproval={vi.fn()} />);

    await screen.findByRole("option", { name: "Payments Squad" });
    await user.type(screen.getByLabelText(/application name/i), "Checkout Web");
    await user.click(screen.getByRole("button", { name: /create application/i }));

    expect(await screen.findByText(/approval required/i)).toBeInTheDocument();
    expect(screen.getByText("Checkout Web", { selector: ".aic-val" })).toBeInTheDocument();
    expect(created).toBe(false);

    await user.click(screen.getByRole("button", { name: /send for approval/i }));

    await vi.waitFor(() => expect(created).toBe(true));
    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: "9" })));
  });

  it("cancelling the intercept keeps the form open with the typed name intact", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === "/api/profile/teams") return Promise.resolve(jsonResponse(200, { success: true, teams: [{ id: "1", name: "Payments Squad" }] }));
      if (path === "/api/approval/required?action_type=application_create") return Promise.resolve(jsonResponse(200, { data: { required: true } }));
      return Promise.resolve(jsonResponse(200, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<AppModal isRoot={false} onClose={onClose} onCreated={vi.fn()} onUpdated={vi.fn()} onPendingApproval={vi.fn()} />);

    await screen.findByRole("option", { name: "Payments Squad" });
    await user.type(screen.getByLabelText(/application name/i), "Checkout Web");
    await user.click(screen.getByRole("button", { name: /create application/i }));
    await screen.findByText(/approval required/i);

    // Duas modais empilhadas (AppModal + o intercept) — o botão "Cancel" do intercept é o
    // último no DOM, já que ele é renderizado depois do AppModal.
    const cancelButtons = screen.getAllByRole("button", { name: /^cancel$/i });
    await user.click(cancelButtons[cancelButtons.length - 1]);

    expect(screen.queryByText(/approval required/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/application name/i)).toHaveValue("Checkout Web");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("root never sees the intercept, even when the action would require approval for others", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === "/api/teams") return Promise.resolve(jsonResponse(200, { success: true, teams: [{ id: "1", name: "Payments Squad" }] }));
      if (path === "/api/approval/required") throw new Error("root must never call the approval-required check");
      return Promise.resolve(jsonResponse(201, { id: "9", name: "Checkout Web", created_at: "", updated_at: "" }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const onCreated = vi.fn();
    const user = userEvent.setup();

    render(<AppModal isRoot onClose={vi.fn()} onCreated={onCreated} onUpdated={vi.fn()} onPendingApproval={vi.fn()} />);

    await screen.findByRole("option", { name: "Payments Squad" });
    await user.type(screen.getByLabelText(/application name/i), "Checkout Web");
    await user.click(screen.getByRole("button", { name: /create application/i }));

    await vi.waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(screen.queryByText(/approval required/i)).not.toBeInTheDocument();
  });

  it("does not show a team field's counterpart delete button (create mode has nothing to delete)", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, teams: [] })));

    render(<AppModal isRoot onClose={vi.fn()} onCreated={vi.fn()} onUpdated={vi.fn()} onPendingApproval={vi.fn()} onDeleteRequest={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });
});

describe("AppModal — edit mode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pre-fills the current name, shows no team picker, and titles itself 'Edit application'", () => {
    vi.stubGlobal("fetch", vi.fn());

    render(
      <AppModal isRoot initial={{ id: "1", name: "Checkout Web" }} onClose={vi.fn()} onCreated={vi.fn()} onUpdated={vi.fn()} onPendingApproval={vi.fn()} />
    );

    expect(screen.getByText("Edit application")).toBeInTheDocument();
    expect(screen.getByLabelText(/application name/i)).toHaveValue("Checkout Web");
    expect(screen.queryByLabelText(/^team$/i)).not.toBeInTheDocument();
  });

  it("renames via PUT and calls onUpdated with the response, without requiring a team", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: "1", name: "Checkout Web v2", created_at: "", updated_at: "" }));
    vi.stubGlobal("fetch", fetchMock);
    const onUpdated = vi.fn();
    const user = userEvent.setup();

    render(
      <AppModal isRoot initial={{ id: "1", name: "Checkout Web" }} onClose={vi.fn()} onCreated={vi.fn()} onUpdated={onUpdated} onPendingApproval={vi.fn()} />
    );

    await user.clear(screen.getByLabelText(/application name/i));
    await user.type(screen.getByLabelText(/application name/i), "Checkout Web v2");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await vi.waitFor(() => expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ id: "1", name: "Checkout Web v2" })));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/applications/1",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ name: "Checkout Web v2" }) })
    );
  });

  it("shows a delete button that calls onDeleteRequest with the app id and name", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const onDeleteRequest = vi.fn();
    const user = userEvent.setup();

    render(
      <AppModal
        isRoot
        initial={{ id: "1", name: "Checkout Web" }}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        onUpdated={vi.fn()}
        onPendingApproval={vi.fn()}
        onDeleteRequest={onDeleteRequest}
      />
    );

    await user.click(screen.getByRole("button", { name: /delete/i }));

    expect(onDeleteRequest).toHaveBeenCalledWith("1", "Checkout Web");
  });

  it("calls onPendingApproval (not onUpdated) when the update is intercepted for approval", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(202, { approval_required: true, action_type: "application_create" })));
    const onUpdated = vi.fn();
    const onPendingApproval = vi.fn();
    const user = userEvent.setup();

    render(
      <AppModal
        isRoot
        initial={{ id: "1", name: "Checkout Web" }}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        onUpdated={onUpdated}
        onPendingApproval={onPendingApproval}
      />
    );

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await vi.waitFor(() => expect(onPendingApproval).toHaveBeenCalledWith("application_create"));
    expect(onUpdated).not.toHaveBeenCalled();
  });
});
