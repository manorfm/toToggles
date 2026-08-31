import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
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
  has_secret_key: false,
};

describe("AppCard", () => {
  it("shows the application name and toggle counts", () => {
    render(
      <MemoryRouter>
        <AppCard application={app} accentIndex={0} />
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
        <AppCard application={app} accentIndex={0} />
      </MemoryRouter>
    );

    expect(screen.getByRole("link")).toHaveAttribute("href", "/applications/01APP0000000000000000001");
  });

  it("shows a two-letter glyph derived from the name", () => {
    render(
      <MemoryRouter>
        <AppCard application={app} accentIndex={0} />
      </MemoryRouter>
    );

    expect(screen.getByText("CW")).toBeInTheDocument(); // "Checkout Web"
  });

  it("shows an edit button when canEdit is true, and clicking it calls onEdit without navigating", async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AppCard application={app} accentIndex={0} canEdit onEdit={onEdit} />
      </MemoryRouter>
    );

    const editButton = screen.getByRole("button", { name: /edit application/i });
    await user.click(editButton);

    expect(onEdit).toHaveBeenCalledWith(app);
  });

  it("does not show an edit button when canEdit is false", () => {
    render(
      <MemoryRouter>
        <AppCard application={app} accentIndex={0} canEdit={false} onEdit={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.queryByRole("button", { name: /edit application/i })).not.toBeInTheDocument();
  });

  it("shows 'No service key' and a Generate CTA when has_secret_key is false", () => {
    render(
      <MemoryRouter>
        <AppCard application={{ ...app, has_secret_key: false }} accentIndex={0} />
      </MemoryRouter>
    );

    expect(screen.getByText("No service key")).toBeInTheDocument();
    expect(screen.getByText("Generate")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows 'Service key active' and a Manage CTA when has_secret_key is true", () => {
    render(
      <MemoryRouter>
        <AppCard application={{ ...app, has_secret_key: true }} accentIndex={0} />
      </MemoryRouter>
    );

    expect(screen.getByText("Service key active")).toBeInTheDocument();
    expect(screen.getByText("Manage")).toBeInTheDocument();
    expect(screen.getByText("Key")).toBeInTheDocument();
  });

  it("navigates straight to the service key section, not just the application root", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<AppCard application={{ ...app, has_secret_key: true }} accentIndex={0} />} />
          <Route path="/applications/:id" element={<div>detail screen</div>} />
        </Routes>
      </MemoryRouter>
    );

    await user.click(screen.getByTitle("Manage service key"));

    expect(await screen.findByText("detail screen")).toBeInTheDocument();
  });
});
