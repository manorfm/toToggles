import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

describe("Modal", () => {
  it("renders icon, title, sub, children and footer", () => {
    render(
      <Modal icon="users" title="New team" sub="Teams group people" onClose={vi.fn()} footer={<button>Create team</button>}>
        <div>form fields</div>
      </Modal>
    );

    expect(screen.getByText("New team")).toBeInTheDocument();
    expect(screen.getByText("Teams group people")).toBeInTheDocument();
    expect(screen.getByText("form fields")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create team" })).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal icon="users" title="New team" onClose={onClose}>
        <div>content</div>
      </Modal>
    );

    await user.click(screen.getByRole("button", { name: /close/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the scrim (outside the modal) is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal icon="users" title="New team" onClose={onClose}>
        <div>content</div>
      </Modal>
    );

    await user.click(screen.getByTestId("modal-scrim"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when clicking inside the modal body", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal icon="users" title="New team" onClose={onClose}>
        <div>content</div>
      </Modal>
    );

    await user.click(screen.getByText("content"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("disables the close button when closeable is false", () => {
    render(
      <Modal icon="users" title="New team" onClose={vi.fn()} closeable={false}>
        <div>content</div>
      </Modal>
    );

    expect(screen.getByRole("button", { name: /close/i })).toBeDisabled();
  });
});
