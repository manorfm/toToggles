import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApprovalInterceptModal } from "./ApprovalInterceptModal";

describe("ApprovalInterceptModal", () => {
  it("shows the action description, target path, and expiry, and confirms/cancels", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();

    render(<ApprovalInterceptModal actionDesc="Delete toggle" path="payments.card" onConfirm={onConfirm} onCancel={onCancel} />);

    expect(screen.getByText(/approval required/i)).toBeInTheDocument();
    expect(screen.getByText("Delete toggle")).toBeInTheDocument();
    expect(screen.getByText("payments.card")).toBeInTheDocument();
    expect(screen.getByText(/7 days/i)).toBeInTheDocument();
    expect(screen.getByText(/will not run now/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /send for approval/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("omits the target row when no path is given", () => {
    render(<ApprovalInterceptModal actionDesc="Create application" onConfirm={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.queryByText(/target/i)).not.toBeInTheDocument();
  });

  it("shows the reviewing team when given", () => {
    render(<ApprovalInterceptModal actionDesc="Delete toggle" path="payments.card" team="Payments Squad" onConfirm={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText(/approvers of the/i)).toBeInTheDocument();
    expect(screen.getByText("Payments Squad")).toBeInTheDocument();
  });

  it("omits the reviewed-by row when no team is known", () => {
    render(<ApprovalInterceptModal actionDesc="Create application" onConfirm={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.queryByText(/reviewed by/i)).not.toBeInTheDocument();
  });

  it("disables both buttons and shows a busy label while confirming", () => {
    render(<ApprovalInterceptModal actionDesc="Delete toggle" onConfirm={vi.fn()} onCancel={vi.fn()} busy />);

    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /sending/i })).toBeDisabled();
  });
});
