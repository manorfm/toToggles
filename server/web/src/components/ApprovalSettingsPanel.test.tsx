import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApprovalSettingsPanel } from "./ApprovalSettingsPanel";
import type { ApprovalSettings } from "../types/approvalSettings";

const disabledConfig = {
  toggle_create: false,
  toggle_update: false,
  toggle_delete: true,
  toggle_enable: false,
  toggle_disable: false,
  toggle_rule: true,
  application_create: true,
  application_delete: true,
  secret_key_create: true,
  secret_key_delete: true,
};

function settings(overrides: Partial<ApprovalSettings> = {}): ApprovalSettings {
  return {
    id: "01SET00000000000000000001",
    approval_enabled: false,
    required_actions: disabledConfig,
    default_expiration_days: 7,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function renderPanel(overrides: Partial<Parameters<typeof ApprovalSettingsPanel>[0]> = {}) {
  return render(
    <ApprovalSettingsPanel
      settings={settings()}
      busy={false}
      error={null}
      expirationDays="7"
      savingExpiration={false}
      onToggleSystem={vi.fn()}
      onToggleAction={vi.fn()}
      onExpirationDaysChange={vi.fn()}
      onSaveExpiration={vi.fn()}
      {...overrides}
    />
  );
}

describe("ApprovalSettingsPanel", () => {
  it("shows the disabled-system copy and notice when approval_enabled is false", () => {
    renderPanel();

    expect(screen.getByText(/sistema de aprovação/i)).toBeInTheDocument();
    expect(screen.getByText(/todas as ações executam imediatamente/i)).toBeInTheDocument();
    expect(screen.getByText(/todas as ações executam diretamente/i)).toBeInTheDocument();
    expect(screen.queryByText("Delete toggle")).not.toBeInTheDocument();
  });

  it("shows the action list with the enforced count badge when enabled", () => {
    renderPanel({ settings: settings({ approval_enabled: true }) });

    expect(screen.getByText("Delete toggle")).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.className === "badge on" && el.textContent === "6 ativas")).toBeInTheDocument();
  });

  it("calls onToggleSystem when the master switch is clicked", async () => {
    const onToggleSystem = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onToggleSystem });

    await user.click(screen.getByRole("button", { name: /sistema de aprovação/i }));

    expect(onToggleSystem).toHaveBeenCalledTimes(1);
  });

  it("calls onToggleAction with the action key when a row switch is clicked", async () => {
    const onToggleAction = vi.fn();
    const user = userEvent.setup();
    renderPanel({ settings: settings({ approval_enabled: true }), onToggleAction });

    await user.click(screen.getByRole("button", { name: "Create toggle" }));

    expect(onToggleAction).toHaveBeenCalledWith("toggle_create");
  });

  it("shows a not-enforced hint next to an action the middleware never actually infers", () => {
    renderPanel({ settings: settings({ approval_enabled: true }) });

    expect(screen.getByText(/enabling a toggle is gated/i)).toBeInTheDocument();
  });

  it("calls onSaveExpiration with the current expirationDays value", async () => {
    const onSaveExpiration = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onSaveExpiration });

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(onSaveExpiration).toHaveBeenCalledTimes(1);
  });

  it("shows the error message when given one", () => {
    renderPanel({ error: "Forbidden" });

    expect(screen.getByText("Forbidden")).toBeInTheDocument();
  });
});
