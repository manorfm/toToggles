import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./CommandPalette";
import type { CommandPaletteData } from "../lib/commandPalette";

function data(overrides: Partial<CommandPaletteData> = {}): CommandPaletteData {
  return { apps: [], toggles: [], teams: [], people: [], ...overrides };
}

describe("CommandPalette", () => {
  it("shows the first apps unfiltered, grouped under 'Applications'", () => {
    render(
      <CommandPalette
        data={data({ apps: [{ id: "1", name: "Checkout Web" }] })}
        onClose={vi.fn()}
        onGoApp={vi.fn()}
        onGoToggle={vi.fn()}
        onGoTeams={vi.fn()}
        onGoUsers={vi.fn()}
      />
    );

    expect(screen.getByText("Applications")).toBeInTheDocument();
    expect(screen.getByText("Checkout Web")).toBeInTheDocument();
  });

  it("shows 'No matches.' when a query matches nothing", async () => {
    const user = userEvent.setup();
    render(
      <CommandPalette
        data={data({ apps: [{ id: "1", name: "Checkout Web" }] })}
        onClose={vi.fn()}
        onGoApp={vi.fn()}
        onGoToggle={vi.fn()}
        onGoTeams={vi.fn()}
        onGoUsers={vi.fn()}
      />
    );

    await user.type(screen.getByPlaceholderText(/search applications/i), "zzz-nothing");

    expect(screen.getByText("No matches.")).toBeInTheDocument();
  });

  it("calls onGoApp with the app id when an app result is clicked", async () => {
    const onGoApp = vi.fn();
    const user = userEvent.setup();
    render(
      <CommandPalette
        data={data({ apps: [{ id: "app-1", name: "Checkout Web" }] })}
        onClose={vi.fn()}
        onGoApp={onGoApp}
        onGoToggle={vi.fn()}
        onGoTeams={vi.fn()}
        onGoUsers={vi.fn()}
      />
    );

    await user.click(screen.getByText("Checkout Web"));

    expect(onGoApp).toHaveBeenCalledWith("app-1");
  });

  it("groups and shows toggle results (with their app name), calling onGoToggle on click", async () => {
    const onGoToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <CommandPalette
        data={data({ toggles: [{ appId: "app-1", appName: "Checkout Web", path: "payments.card" }] })}
        onClose={vi.fn()}
        onGoApp={vi.fn()}
        onGoToggle={onGoToggle}
        onGoTeams={vi.fn()}
        onGoUsers={vi.fn()}
      />
    );

    await user.type(screen.getByPlaceholderText(/search applications/i), "payments");

    expect(screen.getByText("Toggles")).toBeInTheDocument();
    expect(screen.getByText("payments.card")).toBeInTheDocument();
    expect(screen.getByText("Checkout Web")).toBeInTheDocument();

    await user.click(screen.getByText("payments.card"));

    expect(onGoToggle).toHaveBeenCalledWith("app-1", "payments.card");
  });

  it("groups and shows team results, calling onGoTeams on click", async () => {
    const onGoTeams = vi.fn();
    const user = userEvent.setup();
    render(
      <CommandPalette
        data={data({ teams: [{ id: "t1", name: "Payments Squad" }] })}
        onClose={vi.fn()}
        onGoApp={vi.fn()}
        onGoToggle={vi.fn()}
        onGoTeams={onGoTeams}
        onGoUsers={vi.fn()}
      />
    );

    await user.type(screen.getByPlaceholderText(/search applications/i), "payments");

    expect(screen.getByText("Teams")).toBeInTheDocument();
    await user.click(screen.getByText("Payments Squad"));

    expect(onGoTeams).toHaveBeenCalledTimes(1);
  });

  it("groups and shows people results, calling onGoUsers on click", async () => {
    const onGoUsers = vi.fn();
    const user = userEvent.setup();
    render(
      <CommandPalette
        data={data({ people: [{ id: "u1", name: "Alice Root", username: "alice" }] })}
        onClose={vi.fn()}
        onGoApp={vi.fn()}
        onGoToggle={vi.fn()}
        onGoTeams={vi.fn()}
        onGoUsers={onGoUsers}
      />
    );

    await user.type(screen.getByPlaceholderText(/search applications/i), "alice");

    expect(screen.getByText("People")).toBeInTheDocument();
    await user.click(screen.getByText("Alice Root"));

    expect(onGoUsers).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <CommandPalette data={data()} onClose={onClose} onGoApp={vi.fn()} onGoToggle={vi.fn()} onGoTeams={vi.fn()} onGoUsers={vi.fn()} />
    );

    await user.type(screen.getByPlaceholderText(/search applications/i), "{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when clicking the scrim outside the box", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <CommandPalette data={data()} onClose={onClose} onGoApp={vi.fn()} onGoToggle={vi.fn()} onGoTeams={vi.fn()} onGoUsers={vi.fn()} />
    );

    await user.click(container.querySelector(".cmdk-scrim")!);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
