import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NotMigratedScreen } from "./NotMigratedScreen";

describe("NotMigratedScreen", () => {
  it("renders as regular page content by default (for use inside AppShell)", () => {
    render(<NotMigratedScreen title="Teams & people" />);

    expect(screen.getByText("Teams & people")).toBeInTheDocument();
    expect(document.querySelector(".auth-stage")).not.toBeInTheDocument();
    expect(document.querySelector(".page")).toBeInTheDocument();
  });

  it("renders as a full-screen overlay when fullScreen is set (standalone routes like /change-password)", () => {
    render(<NotMigratedScreen title="Troca de senha" fullScreen />);

    expect(screen.getByText("Troca de senha")).toBeInTheDocument();
    expect(document.querySelector(".auth-stage")).toBeInTheDocument();
  });
});
