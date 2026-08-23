import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateApplicationModal } from "./CreateApplicationModal";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("CreateApplicationModal", () => {
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

    render(<CreateApplicationModal isRoot onClose={vi.fn()} onCreated={onCreated} onPendingApproval={vi.fn()} />);

    expect(await screen.findByRole("option", { name: "Payments Squad" })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/application name/i), "Checkout Web");
    await user.selectOptions(screen.getByLabelText(/team/i), "1");
    await user.click(screen.getByRole("button", { name: /create application/i }));

    await vi.waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: "9", name: "Checkout Web" }))
    );
  });

  it("shows a hint and disables submit when there are no team options", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, teams: [] })));

    render(<CreateApplicationModal isRoot={false} onClose={vi.fn()} onCreated={vi.fn()} onPendingApproval={vi.fn()} />);

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

    render(<CreateApplicationModal isRoot onClose={vi.fn()} onCreated={onCreated} onPendingApproval={onPendingApproval} />);

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

    render(<CreateApplicationModal isRoot onClose={onClose} onCreated={vi.fn()} onPendingApproval={vi.fn()} />);

    await screen.findByRole("option", { name: "Payments Squad" });
    await user.type(screen.getByLabelText(/application name/i), "Checkout Web");
    await user.click(screen.getByRole("button", { name: /create application/i }));

    expect(await screen.findByText(/application already exists/i)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
