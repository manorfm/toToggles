import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToggleTree } from "./ToggleTree";
import type { ToggleNode } from "../types/toggle";

const nodes: ToggleNode[] = [
  {
    id: "1",
    value: "user",
    enabled: true,
    toggles: [{ id: "2", value: "payments", enabled: false }],
  },
  { id: "3", value: "billing", enabled: true },
];

describe("ToggleTree", () => {
  it("renders every node, including nested children", () => {
    render(<ToggleTree nodes={nodes} onToggle={vi.fn()} />);

    expect(screen.getByText("user")).toBeInTheDocument();
    expect(screen.getByText("payments")).toBeInTheDocument();
    expect(screen.getByText("billing")).toBeInTheDocument();
  });

  it("reflects enabled state on each switch", () => {
    render(<ToggleTree nodes={nodes} onToggle={vi.fn()} />);

    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(3);
    expect(switches[0]).toHaveAttribute("aria-checked", "true"); // user
    expect(switches[1]).toHaveAttribute("aria-checked", "false"); // payments
    expect(switches[2]).toHaveAttribute("aria-checked", "true"); // billing
  });

  it("calls onToggle with the node id and the flipped state", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<ToggleTree nodes={nodes} onToggle={onToggle} />);

    await user.click(screen.getAllByRole("switch")[1]); // payments, currently off

    expect(onToggle).toHaveBeenCalledWith("2", true);
  });

  it("disables every switch when disabled is set", () => {
    render(<ToggleTree nodes={nodes} onToggle={vi.fn()} disabled />);

    for (const el of screen.getAllByRole("switch")) {
      expect(el).toBeDisabled();
    }
  });
});
