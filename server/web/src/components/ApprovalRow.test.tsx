import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApprovalRow } from "./ApprovalRow";
import type { ApprovalRequest } from "../types/approval";

const pending: ApprovalRequest = {
  id: "1",
  action_type: "toggle_delete",
  description: "",
  requested_by: "u1",
  team_id: "t1",
  application_id: "app1",
  application_name: "Checkout Web",
  toggle_id: "tg1",
  toggle_path: "payments.card",
  status: "pending",
  expires_at: "",
  created_at: "2026-08-19T10:00:00Z",
  updated_at: "",
  requester_name: "alice",
  team_name: "Payments Squad",
};

describe("ApprovalRow", () => {
  it("shows the action, application/toggle path and requester", () => {
    render(<ApprovalRow request={pending} onApprove={vi.fn()} onReject={vi.fn()} />);

    expect(screen.getByText(/delete toggle/i)).toBeInTheDocument();
    expect(screen.getByText("Checkout Web", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("payments.card")).toBeInTheDocument();
    expect(screen.getByText(/alice/)).toBeInTheDocument();
  });

  it("shows Aprovar/Rejeitar for a pending request and calls the handlers", async () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const user = userEvent.setup();
    render(<ApprovalRow request={pending} onApprove={onApprove} onReject={onReject} />);

    await user.click(screen.getByRole("button", { name: /aprovar/i }));
    expect(onApprove).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /rejeitar/i }));
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("shows a status chip instead of actions for a resolved request", () => {
    render(<ApprovalRow request={{ ...pending, status: "approved" }} onApprove={vi.fn()} onReject={vi.fn()} />);

    expect(screen.getByText(/aprovado/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /aprovar/i })).not.toBeInTheDocument();
  });

  it("shows the rejection reason when rejected", () => {
    render(
      <ApprovalRow
        request={{ ...pending, status: "rejected", rejection_reason: "Toggle still in use" }}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    expect(screen.getByText(/toggle still in use/i)).toBeInTheDocument();
  });

  it("disables the action buttons while busy", () => {
    render(<ApprovalRow request={pending} onApprove={vi.fn()} onReject={vi.fn()} busy />);

    expect(screen.getByRole("button", { name: /aprovar/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /rejeitar/i })).toBeDisabled();
  });

  it("shows a 'Pendente' chip (not 'Expirado') for a pending request when readOnly", () => {
    render(<ApprovalRow request={pending} onApprove={vi.fn()} onReject={vi.fn()} readOnly />);

    expect(screen.getByText(/pendente/i)).toBeInTheDocument();
    expect(screen.queryByText(/expirado/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /aprovar/i })).not.toBeInTheDocument();
  });

  it("shows an 'Expirado' chip for an actually expired request", () => {
    render(<ApprovalRow request={{ ...pending, status: "expired" }} onApprove={vi.fn()} onReject={vi.fn()} readOnly />);

    expect(screen.getByText(/expirado/i)).toBeInTheDocument();
  });

  it("shows an 'awaiting review' hint for your own pending request, on top of the status chip", () => {
    render(<ApprovalRow request={pending} onApprove={vi.fn()} onReject={vi.fn()} readOnly isOwn />);

    expect(screen.getByText(/aguardando revisão de um aprovador/i)).toBeInTheDocument();
    expect(screen.getByText(/^pendente$/i)).toBeInTheDocument();
  });

  it("does not show the 'awaiting review' hint for someone else's request", () => {
    render(<ApprovalRow request={pending} onApprove={vi.fn()} onReject={vi.fn()} readOnly />);

    expect(screen.queryByText(/aguardando revisão de um aprovador/i)).not.toBeInTheDocument();
  });

  it("does not show the 'awaiting review' hint once your own request is resolved", () => {
    render(<ApprovalRow request={{ ...pending, status: "approved" }} onApprove={vi.fn()} onReject={vi.fn()} readOnly isOwn />);

    expect(screen.queryByText(/aguardando revisão de um aprovador/i)).not.toBeInTheDocument();
  });
});
