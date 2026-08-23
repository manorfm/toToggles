import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmModal } from "./ConfirmModal";

describe("ConfirmModal", () => {
  it("renders title, sub and body, with a default 'Confirm' label", () => {
    render(<ConfirmModal title="Delete team" sub="This can't be undone." body={<p>Payments Squad</p>} onClose={vi.fn()} onConfirm={vi.fn()} />);

    expect(screen.getByText("Delete team")).toBeInTheDocument();
    expect(screen.getByText("This can't be undone.")).toBeInTheDocument();
    expect(screen.getByText("Payments Squad")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^confirm$/i })).toBeInTheDocument();
  });

  it("uses confirmLabel when given, and calls onConfirm when clicked", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<ConfirmModal title="Delete team" confirmLabel="Delete" onClose={vi.fn()} onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Cancel is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ConfirmModal title="Delete team" onClose={onClose} onConfirm={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("uses the danger button style and trash icon by default when danger is set", () => {
    render(<ConfirmModal title="Delete team" danger onClose={vi.fn()} onConfirm={vi.fn()} />);

    expect(screen.getByRole("button", { name: /^confirm$/i })).toHaveClass("btn-danger-fill");
  });
});
