import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuditToolbar } from "./AuditToolbar";
import type { AuditActor } from "../types/audit";

const actors: AuditActor[] = [
  { id: "u1", name: "Alice" },
  { id: "u2", name: "Bob" },
];

describe("AuditToolbar", () => {
  it("lists 'All actors' plus every actor by name in the select", () => {
    render(
      <AuditToolbar actors={actors} actorId="" onActorChange={vi.fn()} range="all" onRangeChange={vi.fn()} exportDisabled={false} onExport={vi.fn()} />
    );

    expect(screen.getByRole("option", { name: "All actors" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Alice" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Bob" })).toBeInTheDocument();
  });

  it("calls onActorChange with the selected actor's id", async () => {
    const onActorChange = vi.fn();
    const user = userEvent.setup();
    render(
      <AuditToolbar
        actors={actors}
        actorId=""
        onActorChange={onActorChange}
        range="all"
        onRangeChange={vi.fn()}
        exportDisabled={false}
        onExport={vi.fn()}
      />
    );

    await user.selectOptions(screen.getByRole("combobox"), "u2");

    expect(onActorChange).toHaveBeenCalledWith("u2");
  });

  it("shows the 4 range chips, highlighting the active one", () => {
    render(
      <AuditToolbar actors={[]} actorId="" onActorChange={vi.fn()} range="7d" onRangeChange={vi.fn()} exportDisabled={false} onExport={vi.fn()} />
    );

    for (const label of ["All time", "24h", "7 days", "30 days"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "7 days" })).toHaveClass("on");
    expect(screen.getByRole("button", { name: "All time" })).not.toHaveClass("on");
  });

  it("calls onRangeChange with the chip's key when clicked", async () => {
    const onRangeChange = vi.fn();
    const user = userEvent.setup();
    render(
      <AuditToolbar actors={[]} actorId="" onActorChange={vi.fn()} range="all" onRangeChange={onRangeChange} exportDisabled={false} onExport={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "24h" }));

    expect(onRangeChange).toHaveBeenCalledWith("24h");
  });

  it("disables Export CSV when there is nothing to export", () => {
    render(
      <AuditToolbar actors={[]} actorId="" onActorChange={vi.fn()} range="all" onRangeChange={vi.fn()} exportDisabled onExport={vi.fn()} />
    );

    expect(screen.getByRole("button", { name: /export csv/i })).toBeDisabled();
  });

  it("calls onExport when Export CSV is clicked", async () => {
    const onExport = vi.fn();
    const user = userEvent.setup();
    render(
      <AuditToolbar actors={[]} actorId="" onActorChange={vi.fn()} range="all" onRangeChange={vi.fn()} exportDisabled={false} onExport={onExport} />
    );

    await user.click(screen.getByRole("button", { name: /export csv/i }));

    expect(onExport).toHaveBeenCalledTimes(1);
  });

  // v2.6 §7 — a Activity tab de uma aplicação reusa este mesmo toolbar (range + export), mas sem
  // o <select> de ator — confirmado quando o design-graph passou a extrair ActivityView de
  // verdade (antes um "buraco" conhecido da ferramenta): a ActivityView real nunca teve um filtro
  // de ator, só History tem.
  it("omits the actor select entirely when onActorChange is not provided", () => {
    render(<AuditToolbar range="all" onRangeChange={vi.fn()} exportDisabled={false} onExport={vi.fn()} />);

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    for (const label of ["All time", "24h", "7 days", "30 days"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: /export csv/i })).toBeInTheDocument();
  });
});
