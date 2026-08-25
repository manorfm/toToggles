import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusPill } from "./StatusPill";

describe("StatusPill", () => {
  it("shows the confirmed label for each status", () => {
    const { rerender } = render(<StatusPill status="active" />);
    expect(screen.getByText("Ativo")).toBeInTheDocument();

    rerender(<StatusPill status="pending_first_login" />);
    expect(screen.getByText("Aguardando 1º acesso")).toBeInTheDocument();

    rerender(<StatusPill status="disabled" />);
    expect(screen.getByText("Desativado")).toBeInTheDocument();
  });
});
