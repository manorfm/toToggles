import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NotMigratedScreen } from "./NotMigratedScreen";

describe("NotMigratedScreen", () => {
  it("renders as page content, for use inside AppShell", () => {
    render(<NotMigratedScreen title="Teams & people" />);

    expect(screen.getByText("Teams & people")).toBeInTheDocument();
    expect(document.querySelector(".page")).toBeInTheDocument();
  });
});
