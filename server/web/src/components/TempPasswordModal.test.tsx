import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TempPasswordModal } from "./TempPasswordModal";

describe("TempPasswordModal", () => {
  it("titles itself 'User created' by default", () => {
    render(<TempPasswordModal username="ana" password="abc123" onClose={vi.fn()} />);
    expect(screen.getByText("User created")).toBeInTheDocument();
    expect(screen.getByText("abc123")).toBeInTheDocument();
  });

  it("titles itself 'Temporary password reset' when reset is true", () => {
    render(<TempPasswordModal username="ana" password="abc123" reset onClose={vi.fn()} />);
    expect(screen.getByText("Temporary password reset")).toBeInTheDocument();
  });

  it("only allows closing after acknowledging", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<TempPasswordModal username="ana" password="abc123" onClose={onClose} />);

    const doneButton = screen.getByRole("button", { name: /got it, i saved it/i });
    expect(doneButton).toBeDisabled();

    await user.click(screen.getByRole("checkbox"));
    expect(doneButton).not.toBeDisabled();

    await user.click(doneButton);
    expect(onClose).toHaveBeenCalled();
  });
});
