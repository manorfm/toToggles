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

const amberLeaf: ToggleLeaf = {
  leafId: "reader",
  root: "payments",
  segs: ["payments", "reader"],
  ids: ["payments", "reader"],
  rules: [false, false],
  enabledOwn: [false, true], // ancestor off, leaf's own bit on
};

const redLeaf: ToggleLeaf = {
  leafId: "billing",
  root: "billing",
  segs: ["billing"],
  ids: ["billing"],
  rules: [false],
  enabledOwn: [false],
};

describe("ToggleCard", () => {
  it("renders the root chip and the full dotted path as segments", () => {
    render(<ToggleCard leaf={greenLeaf} onEdit={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} canEdit />);

    expect(screen.getByText("payments", { selector: ".root-chip" })).toBeInTheDocument();
    expect(screen.getByText("payments", { selector: ".seg-link" })).toBeInTheDocument();
    expect(screen.getByText("card", { selector: ".seg-link" })).toBeInTheDocument();
  });

  it("shows the RULE badge only when the leaf's own toggle has an activation rule", () => {
    const { rerender } = render(<ToggleCard leaf={greenLeaf} onEdit={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} canEdit />);
    expect(screen.getByText("RULE")).toBeInTheDocument();

    rerender(<ToggleCard leaf={redLeaf} onEdit={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} canEdit />);
    expect(screen.queryByText("RULE")).not.toBeInTheDocument();
  });

  it.each([
    [greenLeaf, "Active"],
    [amberLeaf, "Blocked by a parent"],
    [redLeaf, "Branch disabled"],
  ])("shows the right status footer text for each state", (leaf, footText) => {
    render(<ToggleCard leaf={leaf as ToggleLeaf} onEdit={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} canEdit />);
    expect(screen.getByText(footText)).toBeInTheDocument();
  });

  it("dims the path segments from the first disabled ancestor onward", () => {
    render(<ToggleCard leaf={amberLeaf} onEdit={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} canEdit />);

    expect(screen.getByText("payments", { selector: ".seg-link" })).toHaveClass("dim");
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
    render(<ToggleCard leaf={amberLeaf} onEdit={vi.fn()} onToggle={onToggle} onDelete={vi.fn()} canEdit />);

    const sw = screen.getByRole("switch");
    expect(sw).toBeDisabled();
    await user.click(sw);
    expect(onToggle).not.toHaveBeenCalled();
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
});
