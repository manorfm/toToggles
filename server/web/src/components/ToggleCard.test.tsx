import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToggleCard } from "./ToggleCard";
import type { ToggleLeaf } from "../types/toggle";

const greenLeaf: ToggleLeaf = {
  leafId: "card",
  root: "payments",
  segs: ["payments", "card"],
  ids: ["payments", "card"],
  rules: [false, true],
  enabledOwn: [true, true],
};

// Confirmed against the prototype's real pathStatus()/leafPaths() (decoded from the compressed
// bundle in docs/toToggle.html — see lib/toggleLeaves.ts's header comment): "red" only means the
// ROOT of the path is off; anything else that isn't fully green — including just the leaf's own
// bit being off — is "amber".
const amberBlockedByAncestor: ToggleLeaf = {
  leafId: "reader",
  root: "user",
  segs: ["user", "payments", "reader"],
  ids: ["user", "payments", "reader"],
  rules: [false, false, false],
  enabledOwn: [true, false, true], // root on, middle ancestor off, leaf's own bit on
};

const amberOwnBitOff: ToggleLeaf = {
  leafId: "reader",
  root: "payments",
  segs: ["payments", "reader"],
  ids: ["payments", "reader"],
  rules: [false, false],
  enabledOwn: [true, false], // root/only ancestor on, leaf's own bit off
};

const redLeaf: ToggleLeaf = {
  leafId: "billing",
  root: "billing",
  segs: ["billing"],
  ids: ["billing"],
  rules: [false],
  enabledOwn: [false], // single segment: it's both the root and the leaf
};

describe("ToggleCard", () => {
  it("renders the root chip and the full dotted path as segments", () => {
    render(<ToggleCard leaf={greenLeaf} onEdit={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} canEdit />);

    expect(screen.getByText("payments", { selector: ".root-chip" })).toBeInTheDocument();
    expect(screen.getByText("payments", { selector: ".seg-link" })).toBeInTheDocument();
    expect(screen.getByText("card", { selector: ".seg-link" })).toBeInTheDocument();
  });

  it("shows the RULE badge when ANY segment along the path has an activation rule, not just the leaf's own", () => {
    const { rerender } = render(<ToggleCard leaf={greenLeaf} onEdit={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} canEdit />);
    expect(screen.getByText("RULE")).toBeInTheDocument(); // "card" (the leaf itself) has the rule here

    rerender(<ToggleCard leaf={redLeaf} onEdit={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} canEdit />);
    expect(screen.queryByText("RULE")).not.toBeInTheDocument();

    const ancestorHasRule: ToggleLeaf = { ...amberOwnBitOff, rules: [true, false] };
    rerender(<ToggleCard leaf={ancestorHasRule} onEdit={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} canEdit />);
    expect(screen.getByText("RULE")).toBeInTheDocument(); // only the ancestor has it, not the leaf
  });

  it.each([
    [greenLeaf, "Active"],
    [amberBlockedByAncestor, "Blocked by payments"],
    [amberOwnBitOff, "Blocked by reader"],
    [redLeaf, "Branch disabled"],
  ])("shows the right status footer text for each state", (leaf, footText) => {
    render(<ToggleCard leaf={leaf as ToggleLeaf} onEdit={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} canEdit />);
    expect(screen.getByText(footText)).toBeInTheDocument();
  });

  it("dims the path segments from the first disabled ancestor onward, leaving segments before it untouched", () => {
    render(<ToggleCard leaf={amberBlockedByAncestor} onEdit={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} canEdit />);

    expect(screen.getByText("user", { selector: ".seg-link" })).not.toHaveClass("dim");
    expect(screen.getByText("payments", { selector: ".seg-link" })).toHaveClass("dim");
    expect(screen.getByText("reader", { selector: ".seg-link" })).toHaveClass("dim");
  });

  it("dims only the leaf's own segment when just the leaf itself is off", () => {
    render(<ToggleCard leaf={amberOwnBitOff} onEdit={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} canEdit />);

    expect(screen.getByText("payments", { selector: ".seg-link" })).not.toHaveClass("dim");
    expect(screen.getByText("reader", { selector: ".seg-link" })).toHaveClass("dim");
  });

  it("does not dim any segment when every ancestor is on", () => {
    render(<ToggleCard leaf={greenLeaf} onEdit={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} canEdit />);

    expect(screen.getByText("payments", { selector: ".seg-link" })).not.toHaveClass("dim");
    expect(screen.getByText("card", { selector: ".seg-link" })).not.toHaveClass("dim");
  });

  it("calls onEdit with that segment's own id when a path segment is clicked", async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<ToggleCard leaf={greenLeaf} onEdit={onEdit} onToggle={vi.fn()} onDelete={vi.fn()} canEdit />);

    await user.click(screen.getByText("payments", { selector: ".seg-link" }));
    expect(onEdit).toHaveBeenCalledWith("payments");

    await user.click(screen.getByText("card", { selector: ".seg-link" }));
    expect(onEdit).toHaveBeenCalledWith("card");
  });

  it("does not call onEdit from a segment click when canEdit is false", async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<ToggleCard leaf={greenLeaf} onEdit={onEdit} onToggle={vi.fn()} onDelete={vi.fn()} canEdit={false} />);

    await user.click(screen.getByText("card", { selector: ".seg-link" }));
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("reflects the leaf's own on/off state on the switch and toggles it via onToggle(leafId)", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<ToggleCard leaf={greenLeaf} onEdit={vi.fn()} onToggle={onToggle} onDelete={vi.fn()} canEdit />);

    const sw = screen.getByRole("switch");
    expect(sw).not.toBeDisabled();
    await user.click(sw);
    expect(onToggle).toHaveBeenCalledWith("card");
  });

  it("disables the switch and blocks onToggle when an ancestor is off", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<ToggleCard leaf={amberBlockedByAncestor} onEdit={vi.fn()} onToggle={onToggle} onDelete={vi.fn()} canEdit />);

    const sw = screen.getByRole("switch");
    expect(sw).toBeDisabled();
    await user.click(sw);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("keeps the switch enabled when only the leaf's own bit is off and every ancestor is on", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<ToggleCard leaf={amberOwnBitOff} onEdit={vi.fn()} onToggle={onToggle} onDelete={vi.fn()} canEdit />);

    const sw = screen.getByRole("switch");
    expect(sw).not.toBeDisabled();
    await user.click(sw);
    expect(onToggle).toHaveBeenCalledWith("reader");
  });

  it("renders a disabled, read-only switch when canEdit is false", () => {
    render(<ToggleCard leaf={greenLeaf} onEdit={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} canEdit={false} />);

    expect(screen.getByRole("switch")).toBeDisabled();
  });

  it("shows configure/delete actions only when canEdit is true, and wires them to the leaf id", async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<ToggleCard leaf={greenLeaf} onEdit={onEdit} onToggle={vi.fn()} onDelete={onDelete} canEdit />);

    await user.click(screen.getByRole("button", { name: /configure/i }));
    expect(onEdit).toHaveBeenCalledWith("card");

    await user.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith("card", "payments.card");

    rerender(<ToggleCard leaf={greenLeaf} onEdit={onEdit} onToggle={vi.fn()} onDelete={onDelete} canEdit={false} />);
    expect(screen.queryByRole("button", { name: /configure/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });

  // v2.6 §6.4 — o botão de favoritar existe pra QUALQUER role (confirmado no protótipo real:
  // fica fora do branch canEdit/!canEdit), diferente de Configure/Delete/o switch de verdade.
  describe("favorites (v2.6 §6.4)", () => {
    it("shows an unfilled star and calls onToggleFavorite when clicked, for a non-favorite", async () => {
      const onToggleFavorite = vi.fn();
      const user = userEvent.setup();
      render(
        <ToggleCard leaf={greenLeaf} onEdit={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} canEdit onToggleFavorite={onToggleFavorite} />
      );

      await user.click(screen.getByRole("button", { name: /favorite/i }));
      expect(onToggleFavorite).toHaveBeenCalledTimes(1);
    });

    it("shows a filled star and 'Unfavorite' label when isFavorite is true", () => {
      render(
        <ToggleCard leaf={greenLeaf} onEdit={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} canEdit isFavorite onToggleFavorite={vi.fn()} />
      );

      expect(screen.getByRole("button", { name: /unfavorite/i })).toBeInTheDocument();
    });

    it("shows the favorite star for a non-canEdit (read-only) role too", () => {
      render(
        <ToggleCard leaf={greenLeaf} onEdit={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} canEdit={false} onToggleFavorite={vi.fn()} />
      );

      expect(screen.getByRole("button", { name: /favorite/i })).toBeInTheDocument();
    });

    it("renders no favorite button when onToggleFavorite isn't provided", () => {
      render(<ToggleCard leaf={greenLeaf} onEdit={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} canEdit />);

      expect(screen.queryByRole("button", { name: /favorite/i })).not.toBeInTheDocument();
    });
  });

  // v2.6 §6.5 — em modo de seleção, o checkbox substitui o StatusRing (nunca convivem).
  describe("select mode (v2.6 §6.5)", () => {
    it("shows a checkbox instead of the status ring when selectMode is on, and calls onSelectToggle(leafId)", async () => {
      const onSelectToggle = vi.fn();
      const user = userEvent.setup();
      render(
        <ToggleCard
          leaf={greenLeaf}
          onEdit={vi.fn()}
          onToggle={vi.fn()}
          onDelete={vi.fn()}
          canEdit
          selectMode
          selected={false}
          onSelectToggle={onSelectToggle}
        />
      );

      const checkbox = screen.getByRole("checkbox");
      expect(checkbox).not.toBeChecked();
      await user.click(checkbox);
      expect(onSelectToggle).toHaveBeenCalledWith("card");
    });

    it("checks the box when selected is true", () => {
      render(
        <ToggleCard
          leaf={greenLeaf}
          onEdit={vi.fn()}
          onToggle={vi.fn()}
          onDelete={vi.fn()}
          canEdit
          selectMode
          selected
          onSelectToggle={vi.fn()}
        />
      );

      expect(screen.getByRole("checkbox")).toBeChecked();
    });

    it("adds the 'sel' class when selected", () => {
      const { container } = render(
        <ToggleCard
          leaf={greenLeaf}
          onEdit={vi.fn()}
          onToggle={vi.fn()}
          onDelete={vi.fn()}
          canEdit
          selectMode
          selected
          onSelectToggle={vi.fn()}
        />
      );

      expect(container.querySelector(".tg-card")).toHaveClass("sel");
    });

    it("does not show a checkbox when selectMode is on but canEdit is false", () => {
      render(
        <ToggleCard
          leaf={greenLeaf}
          onEdit={vi.fn()}
          onToggle={vi.fn()}
          onDelete={vi.fn()}
          canEdit={false}
          selectMode
          selected={false}
          onSelectToggle={vi.fn()}
        />
      );

      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
      expect(screen.getByRole("switch")).toBeInTheDocument();
    });
  });

  // v2.6 §6.6 — "Suggest a change" só existe pra quem não pode editar (role user), nunca junto
  // com o switch de verdade.
  describe("suggest a change (v2.6 §6.6)", () => {
    it("shows a rocket 'Suggest a change' button next to the read-only switch when onSuggest is provided", async () => {
      const onSuggest = vi.fn();
      const user = userEvent.setup();
      render(
        <ToggleCard leaf={greenLeaf} onEdit={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} canEdit={false} onSuggest={onSuggest} />
      );

      await user.click(screen.getByRole("button", { name: /suggest a change/i }));
      expect(onSuggest).toHaveBeenCalledWith(greenLeaf);
    });

    it("never shows the suggest button when canEdit is true, even if onSuggest is provided", () => {
      render(<ToggleCard leaf={greenLeaf} onEdit={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} canEdit onSuggest={vi.fn()} />);

      expect(screen.queryByRole("button", { name: /suggest a change/i })).not.toBeInTheDocument();
    });

    it("does not show the suggest button when onSuggest isn't provided", () => {
      render(<ToggleCard leaf={greenLeaf} onEdit={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} canEdit={false} />);

      expect(screen.queryByRole("button", { name: /suggest a change/i })).not.toBeInTheDocument();
    });
  });
});
