import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ArchivedModal } from "./ArchivedModal";
import type { ArchivedToggle } from "../types/toggle";

function entry(overrides: Partial<ArchivedToggle> & { id: string }): ArchivedToggle {
  return {
    path: "payments.card",
    deletedAt: new Date().toISOString(),
    deletedByName: "alice",
    ...overrides,
  };
}

describe("ArchivedModal", () => {
  it("shows the confirmed empty state when there's nothing archived", () => {
    render(<ArchivedModal entries={[]} onClose={vi.fn()} onRestore={vi.fn()} />);

    expect(screen.getByText("Archived toggles")).toBeInTheDocument();
    expect(screen.getByText("Nothing archived.")).toBeInTheDocument();
  });

  it("lists each archived entry with its path and who/when it was deleted", () => {
    render(
      <ArchivedModal
        entries={[entry({ id: "1", path: "payments.card", deletedByName: "alice" })]}
        onClose={vi.fn()}
        onRestore={vi.fn()}
      />
    );

    expect(screen.getByText("payments.card")).toBeInTheDocument();
    expect(screen.getByText(/deleted by alice/i)).toBeInTheDocument();
  });

  it("calls onRestore with the entry's id when its Restore button is clicked", async () => {
    const onRestore = vi.fn();
    const user = userEvent.setup();
    render(
      <ArchivedModal
        entries={[entry({ id: "archived-1" }), entry({ id: "archived-2", path: "user.beta" })]}
        onClose={vi.fn()}
        onRestore={onRestore}
      />
    );

    await user.click(screen.getAllByRole("button", { name: /restore/i })[1]);

    expect(onRestore).toHaveBeenCalledWith("archived-2");
  });

  it("calls onClose when Done is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ArchivedModal entries={[]} onClose={onClose} onRestore={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /done/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
