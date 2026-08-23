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
    render(<CreateToggleModal applicationId="app1" onClose={vi.fn()} onCreated={vi.fn()} onPendingApproval={vi.fn()} />);

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

    render(<CreateToggleModal applicationId="app1" onClose={onClose} onCreated={onCreated} onPendingApproval={vi.fn()} />);
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

    render(<CreateToggleModal applicationId="app1" onClose={vi.fn()} onCreated={onCreated} onPendingApproval={onPendingApproval} />);
    await user.type(screen.getByLabelText(/toggle path/i), "payments.card");
    await user.click(screen.getByRole("button", { name: /create/i }));

    await vi.waitFor(() => expect(onPendingApproval).toHaveBeenCalledWith("toggle_create"));
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("shows the server's error message without closing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(400, { code: "T0003", message: "toggle already exists" })));
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<CreateToggleModal applicationId="app1" onClose={onClose} onCreated={vi.fn()} onPendingApproval={vi.fn()} />);
    await user.type(screen.getByLabelText(/toggle path/i), "payments.card");
    await user.click(screen.getByRole("button", { name: /create/i }));

    expect(await screen.findByText(/toggle already exists/i)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
