import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuditChips, CATEGORY_TABS } from "./AuditChips";

describe("AuditChips", () => {
  it("renders the 5 category chips, highlighting the active one", () => {
    render(<AuditChips tabs={CATEGORY_TABS} active="toggles" onPick={vi.fn()} />);

    for (const label of ["All", "Toggles", "Keys", "Access", "Approvals"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Toggles" })).toHaveClass("on");
    expect(screen.getByRole("button", { name: "All" })).not.toHaveClass("on");
  });

  it("calls onPick with the chip's key when clicked", async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(<AuditChips tabs={CATEGORY_TABS} active="" onPick={onPick} />);

    await user.click(screen.getByRole("button", { name: "Keys" }));

    expect(onPick).toHaveBeenCalledWith("keys");
  });
});
