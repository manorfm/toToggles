import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TogglePaths } from "./TogglePaths";
import type { ToggleLeaf } from "../types/toggle";

const tree: ToggleLeaf[] = [
  { leafId: "card", root: "payments", segs: ["payments", "card"], ids: ["payments", "card"], rules: [false, false], enabledOwn: [true, true] },
  { leafId: "billing", root: "billing", segs: ["billing"], ids: ["billing"], rules: [false], enabledOwn: [true] },
];

function renderPaths(overrides: Partial<React.ComponentProps<typeof TogglePaths>> = {}) {
  return render(
    <TogglePaths
      tree={tree}
      search=""
      setSearch={vi.fn()}
      canEdit
      onToggle={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      {...overrides}
    />
  );
}

describe("TogglePaths", () => {
  it("renders one card per leaf and the legend/toolbar", () => {
    renderPaths();

    expect(screen.getByPlaceholderText("Filter paths… e.g. payments.card")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("blocked")).toBeInTheDocument();
    expect(screen.getByText("off")).toBeInTheDocument();
    expect(screen.getByText("payments", { selector: ".root-chip" })).toBeInTheDocument();
    expect(screen.getByText("billing", { selector: ".root-chip" })).toBeInTheDocument();
  });

  it("calls setSearch as the filter input changes", async () => {
    const setSearch = vi.fn();
    const user = userEvent.setup();
    renderPaths({ setSearch });

    await user.type(screen.getByPlaceholderText("Filter paths… e.g. payments.card"), "x");
    expect(setSearch).toHaveBeenCalledWith("x");
  });

  it("filters the visible cards by the search value against the full dotted path", () => {
    renderPaths({ search: "pay" });

    expect(screen.getByText("payments", { selector: ".root-chip" })).toBeInTheDocument();
    expect(screen.queryByText("billing", { selector: ".root-chip" })).not.toBeInTheDocument();
  });

  it("shows the empty state with 'No toggles yet' when the tree is empty", () => {
    renderPaths({ tree: [] });

    expect(screen.getByText("No toggles yet")).toBeInTheDocument();
    expect(screen.getByText("Create your first toggle path to get started.")).toBeInTheDocument();
  });

  it("shows the empty state with 'No paths match your filter' when search yields nothing", () => {
    renderPaths({ search: "doesnotexist" });

    expect(screen.getByText("No paths match your filter")).toBeInTheDocument();
    expect(screen.getByText("Try a different segment.")).toBeInTheDocument();
  });
});
