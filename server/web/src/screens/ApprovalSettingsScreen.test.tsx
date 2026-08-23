import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApprovalSettingsScreen } from "./ApprovalSettingsScreen";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

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

function settings(overrides: Partial<{ approval_enabled: boolean; required_actions: typeof disabledConfig; default_expiration_days: number }> = {}) {
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

describe("ApprovalSettingsScreen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the disabled-system copy and notice when approval_enabled is false", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { message: "ok", data: settings() })));

    render(<ApprovalSettingsScreen />);

    expect(await screen.findByText(/sistema de aprovação/i)).toBeInTheDocument();
    expect(screen.getByText(/todas as ações executam imediatamente/i)).toBeInTheDocument();
    expect(screen.getByText(/todas as ações executam diretamente/i)).toBeInTheDocument();
    expect(screen.queryByText("Delete toggle")).not.toBeInTheDocument();
  });

  it("turns the system on and shows the action list with the enforced count badge", async () => {
    let enabled = false;
    const fetchMock = vi.fn().mockImplementation((_path: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        enabled = true;
        return Promise.resolve(jsonResponse(200, { message: "ok", data: settings({ approval_enabled: true }) }));
      }
      return Promise.resolve(jsonResponse(200, { message: "ok", data: settings({ approval_enabled: enabled }) }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ApprovalSettingsScreen />);
    await screen.findByText(/sistema de aprovação/i);

    await user.click(screen.getByRole("button", { name: /sistema de aprovação/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/approval/settings",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ approval_enabled: true }) })
    );
    expect(await screen.findByText("Delete toggle")).toBeInTheDocument();
    // disabledConfig tem 6 flags true: toggle_delete, toggle_rule, application_create,
    // application_delete, secret_key_create, secret_key_delete.
    expect(screen.getByText((_, el) => el?.className === "badge on" && el.textContent === "6 ativas")).toBeInTheDocument();
  });

  it("toggling an action row PUTs the whole required_actions object with only that key flipped", async () => {
    const fetchMock = vi.fn().mockImplementation((_path: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return Promise.resolve(jsonResponse(200, { message: "ok", data: settings({ approval_enabled: true, required_actions: { ...disabledConfig, toggle_create: true } }) }));
      }
      return Promise.resolve(jsonResponse(200, { message: "ok", data: settings({ approval_enabled: true }) }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ApprovalSettingsScreen />);
    await screen.findByText("Create toggle");

    await user.click(screen.getByRole("button", { name: "Create toggle" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/approval/settings",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ required_actions: { ...disabledConfig, toggle_create: true } }),
      })
    );
  });

  it("shows a not-enforced hint next to an action that the middleware never actually infers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { message: "ok", data: settings({ approval_enabled: true }) })));

    render(<ApprovalSettingsScreen />);

    expect(await screen.findByText(/enabling a toggle is gated/i)).toBeInTheDocument();
  });

  it("saves a new expiration days value", async () => {
    const fetchMock = vi.fn().mockImplementation((_path: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return Promise.resolve(jsonResponse(200, { message: "ok", data: settings({ default_expiration_days: 14 }) }));
      }
      return Promise.resolve(jsonResponse(200, { message: "ok", data: settings() }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ApprovalSettingsScreen />);
    await screen.findByText(/sistema de aprovação/i);

    const input = screen.getByLabelText(/expiration/i);
    await user.clear(input);
    await user.type(input, "14");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/approval/settings",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ default_expiration_days: 14 }) })
    );
  });

  it("shows an error when the settings can't be loaded (e.g. not root)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(403, { code: "T0004", message: "Forbidden" })));

    render(<ApprovalSettingsScreen />);

    expect(await screen.findByText("Forbidden")).toBeInTheDocument();
  });
});
