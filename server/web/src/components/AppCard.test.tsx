import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppCard } from "./AppCard";
import type { Application } from "../types/application";

const app: Application = {
  id: "01APP0000000000000000001",
  name: "Checkout Web",
  created_at: "2026-08-19T10:00:00Z",
  updated_at: "2026-08-19T10:00:00Z",
  toggles_total: 12,
  toggles_enabled: 9,
  toggles_disabled: 3,
};

describe("AppCard", () => {
  it("shows the application name and toggle counts", () => {
    render(
      <MemoryRouter>
        <AppCard application={app} />
      </MemoryRouter>
    );

    expect(screen.getByText("Checkout Web")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("Toggles")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("links to the application's detail page", () => {
    render(
      <MemoryRouter>
        <AppCard application={app} />
      </MemoryRouter>
    );

    expect(screen.getByRole("link")).toHaveAttribute("href", "/applications/01APP0000000000000000001");
  });
});
