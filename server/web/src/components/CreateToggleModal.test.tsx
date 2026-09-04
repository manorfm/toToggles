import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateToggleModal } from "./CreateToggleModal";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("CreateToggleModal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("disables Create until a path is typed, and shows a live preview", async () => {
    const user = userEvent.setup();
    render(<CreateToggleModal applicationId="app1" isRoot onClose={vi.fn()} onCreated={vi.fn()} onPendingApproval={vi.fn()} />);

    expect(screen.getByRole("button", { name: /create/i })).toBeDisabled();

    await user.type(screen.getByLabelText(/toggle path/i), "payments.card");

    expect(screen.getByRole("button", { name: /create/i })).toBeEnabled();
    expect(screen.getByText("payments")).toBeInTheDocument();
    expect(screen.getByText("card")).toBeInTheDocument();
  });

  it("creates the toggle and calls onCreated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(201, { message: "toggle created successfully", path: "payments.card", enabled: true }))
    );
    const onCreated = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<CreateToggleModal applicationId="app1" isRoot onClose={onClose} onCreated={onCreated} onPendingApproval={vi.fn()} />);
    await user.type(screen.getByLabelText(/toggle path/i), "payments.card");
    await user.click(screen.getByRole("button", { name: /create/i }));

    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith({ path: "payments.card", enabled: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onPendingApproval on 202 instead of onCreated", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(202, { approval_required: true, action_type: "toggle_create" })));
    const onCreated = vi.fn();
    const onPendingApproval = vi.fn();
    const user = userEvent.setup();

    render(<CreateToggleModal applicationId="app1" isRoot onClose={vi.fn()} onCreated={onCreated} onPendingApproval={onPendingApproval} />);
    await user.type(screen.getByLabelText(/toggle path/i), "payments.card");
    await user.click(screen.getByRole("button", { name: /create/i }));

    await vi.waitFor(() => expect(onPendingApproval).toHaveBeenCalledWith("toggle_create"));
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("shows the server's error message without closing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(400, { code: "T0003", message: "toggle already exists" })));
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<CreateToggleModal applicationId="app1" isRoot onClose={onClose} onCreated={vi.fn()} onPendingApproval={vi.fn()} />);
    await user.type(screen.getByLabelText(/toggle path/i), "payments.card");
    await user.click(screen.getByRole("button", { name: /create/i }));

    expect(await screen.findByText(/toggle already exists/i)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows the approval intercept for a non-root caller when the action requires approval, then creates on confirm", async () => {
    let created = false;
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === "/api/approval/required?action_type=toggle_create") return Promise.resolve(jsonResponse(200, { data: { required: true } }));
      created = true;
      return Promise.resolve(jsonResponse(201, { message: "toggle created successfully", path: "payments.card", enabled: true }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const onCreated = vi.fn();
    const user = userEvent.setup();

    render(<CreateToggleModal applicationId="app1" isRoot={false} onClose={vi.fn()} onCreated={onCreated} onPendingApproval={vi.fn()} />);
    await user.type(screen.getByLabelText(/toggle path/i), "payments.card");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    expect(await screen.findByText(/approval required/i)).toBeInTheDocument();
    expect(screen.getByText("payments.card", { selector: ".aic-val" })).toBeInTheDocument();
    expect(created).toBe(false);

    await user.click(screen.getByRole("button", { name: /send for approval/i }));

    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith({ path: "payments.card", enabled: true }));
  });
});
