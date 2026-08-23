import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RejectApprovalModal } from "./RejectApprovalModal";
import type { ApprovalRequest } from "../types/approval";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const request: ApprovalRequest = {
  id: "1",
  action_type: "toggle_delete",
  description: "",
  requested_by: "u1",
  team_id: "t1",
  toggle_path: "payments.card",
  status: "pending",
  expires_at: "",
  created_at: "",
  updated_at: "",
  requester_name: "alice",
  team_name: "Payments Squad",
};

describe("RejectApprovalModal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the request's action, requester and target", () => {
    render(<RejectApprovalModal request={request} onClose={vi.fn()} onRejected={vi.fn()} />);

    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("payments.card")).toBeInTheDocument();
  });

  it("rejects with the typed reason and calls onRejected", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { message: "ok" }));
    vi.stubGlobal("fetch", fetchMock);
    const onRejected = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<RejectApprovalModal request={request} onClose={onClose} onRejected={onRejected} />);
    await user.type(screen.getByLabelText(/motivo/i), "Toggle still in use");
    await user.click(screen.getByRole("button", { name: /confirmar rejeição/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/approval/requests/1/reject",
      expect.objectContaining({ body: JSON.stringify({ reason: "Toggle still in use" }) })
    );
    await vi.waitFor(() => expect(onRejected).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("allows rejecting with no reason", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { message: "ok" }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<RejectApprovalModal request={request} onClose={vi.fn()} onRejected={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /confirmar rejeição/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/approval/requests/1/reject",
      expect.objectContaining({ body: JSON.stringify({ reason: "" }) })
    );
  });
});
