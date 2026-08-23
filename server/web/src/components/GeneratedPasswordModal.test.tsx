import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GeneratedPasswordModal } from "./GeneratedPasswordModal";

describe("GeneratedPasswordModal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the username and password, and blocks closing until acknowledged", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<GeneratedPasswordModal username="bob" password="Xk9$mQ2pLw#T" onClose={onClose} />);

    expect(screen.getByText("bob")).toBeInTheDocument();
    expect(screen.getByText("Xk9$mQ2pLw#T")).toBeInTheDocument();

    const doneButton = screen.getByRole("button", { name: /done/i });
    expect(doneButton).toBeDisabled();

    await user.click(screen.getByRole("checkbox"));
    expect(doneButton).not.toBeDisabled();

    await user.click(doneButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("copies the password to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const user = userEvent.setup();

    render(<GeneratedPasswordModal username="bob" password="Xk9$mQ2pLw#T" onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /copy/i }));

    expect(await screen.findByRole("button", { name: /^copied!$/i })).toBeInTheDocument();
  });
});
