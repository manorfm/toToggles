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

  // v2.6 §6.5 — seleção múltipla: "Select" chip só aparece quando canEdit E onBulkToggle são
  // dados (um role user, ou uma tela que não passa a prop, nunca vê o modo de seleção).
  describe("bulk select (v2.6 §6.5)", () => {
    it("does not show the Select chip when onBulkToggle isn't provided", () => {
      renderPaths();

      expect(screen.queryByRole("button", { name: /^select$/i })).not.toBeInTheDocument();
    });

    it("does not show the Select chip when canEdit is false, even with onBulkToggle provided", () => {
      renderPaths({ canEdit: false, onBulkToggle: vi.fn() });

      expect(screen.queryByRole("button", { name: /^select$/i })).not.toBeInTheDocument();
    });

    it("enters select mode, shows checkboxes, and the bulk bar appears only once something is checked", async () => {
      const user = userEvent.setup();
      renderPaths({ onBulkToggle: vi.fn() });

      await user.click(screen.getByRole("button", { name: /^select$/i }));

      expect(screen.getAllByRole("checkbox")).toHaveLength(2);
      expect(screen.queryByText(/selected/i)).not.toBeInTheDocument();

      await user.click(screen.getAllByRole("checkbox")[0]);
      expect(screen.getByText("1 selected")).toBeInTheDocument();
    });

    it("calls onBulkToggle with the selected leaf IDs and true/false for Enable/Disable selected, then exits select mode", async () => {
      const onBulkToggle = vi.fn();
      const user = userEvent.setup();
      renderPaths({ onBulkToggle });

      await user.click(screen.getByRole("button", { name: /^select$/i }));
      await user.click(screen.getAllByRole("checkbox")[0]);
      await user.click(screen.getAllByRole("checkbox")[1]);
      await user.click(screen.getByRole("button", { name: /enable selected/i }));

      expect(onBulkToggle).toHaveBeenCalledWith(["card", "billing"], true);
      // Saiu do modo de seleção — o chip volta a dizer "Select", sem checkboxes.
      expect(screen.getByRole("button", { name: /^select$/i })).toBeInTheDocument();
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    });

    it("calls onBulkToggle with false for Disable selected", async () => {
      const onBulkToggle = vi.fn();
      const user = userEvent.setup();
      renderPaths({ onBulkToggle });

      await user.click(screen.getByRole("button", { name: /^select$/i }));
      await user.click(screen.getAllByRole("checkbox")[0]);
      await user.click(screen.getByRole("button", { name: /disable selected/i }));

      expect(onBulkToggle).toHaveBeenCalledWith(["card"], false);
    });

    it("Cancel selection exits select mode without calling onBulkToggle", async () => {
      const onBulkToggle = vi.fn();
      const user = userEvent.setup();
      renderPaths({ onBulkToggle });

      await user.click(screen.getByRole("button", { name: /^select$/i }));
      await user.click(screen.getAllByRole("checkbox")[0]);
      await user.click(screen.getByRole("button", { name: /cancel selection/i }));

      expect(onBulkToggle).not.toHaveBeenCalled();
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    });
  });

  it("passes isFavorite/onToggleFavorite through to each card, scoped per leaf", async () => {
    const onToggleFavorite = vi.fn();
    const user = userEvent.setup();
    renderPaths({ isFavorite: (leaf) => leaf.leafId === "card", onToggleFavorite });

    const favoriteButtons = screen.getAllByRole("button", { name: /favorite/i });
    expect(favoriteButtons).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: /^unfavorite$/i }));
    expect(onToggleFavorite).toHaveBeenCalledWith(tree[0]);
  });

  it("passes onSuggest through to each card when canEdit is false", async () => {
    const onSuggest = vi.fn();
    const user = userEvent.setup();
    renderPaths({ canEdit: false, onSuggest });

    const suggestButtons = screen.getAllByRole("button", { name: /suggest a change/i });
    await user.click(suggestButtons[0]);

    expect(onSuggest).toHaveBeenCalledWith(tree[0]);
  });
});
