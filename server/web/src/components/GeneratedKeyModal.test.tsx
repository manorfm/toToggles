import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GeneratedKeyModal } from "./GeneratedKeyModal";

describe("GeneratedKeyModal", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it("shows the plain key and keeps Done disabled until acknowledged", async () => {
    const user = userEvent.setup();
    render(<GeneratedKeyModal plainKey="sk_abc123" onClose={vi.fn()} />);

    expect(screen.getByText("sk_abc123")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /done/i })).toBeDisabled();

    await user.click(screen.getByRole("checkbox"));

    expect(screen.getByRole("button", { name: /done/i })).toBeEnabled();
  });

  it("copies the key to the clipboard and shows feedback", async () => {
    const user = userEvent.setup();
    render(<GeneratedKeyModal plainKey="sk_abc123" onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /copy key/i }));

    expect(await screen.findByRole("button", { name: /copied/i })).toBeInTheDocument();
  });

  it("calls onClose only once acknowledged", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<GeneratedKeyModal plainKey="sk_abc123" onClose={onClose} />);

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /done/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not let the scrim click close the modal before acknowledging", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<GeneratedKeyModal plainKey="sk_abc123" onClose={onClose} />);

    await user.click(screen.getByTestId("modal-scrim"));

    expect(onClose).not.toHaveBeenCalled();
  });
});
