import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
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

  it("shows a two-letter glyph derived from the name", () => {
    render(
      <MemoryRouter>
        <AppCard application={app} />
      </MemoryRouter>
    );

    expect(screen.getByText("CW")).toBeInTheDocument(); // "Checkout Web"
  });

  it("shows an edit button when canEdit is true, and clicking it calls onEdit without navigating", async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AppCard application={app} canEdit onEdit={onEdit} />
      </MemoryRouter>
    );

    const editButton = screen.getByRole("button", { name: /edit application/i });
    await user.click(editButton);

    expect(onEdit).toHaveBeenCalledWith(app);
  });

  it("does not show an edit button when canEdit is false", () => {
    render(
      <MemoryRouter>
        <AppCard application={app} canEdit={false} onEdit={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.queryByRole("button", { name: /edit application/i })).not.toBeInTheDocument();
  });
});
