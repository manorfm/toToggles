import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditToggleDrawer } from "./EditToggleDrawer";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const toggle = {
  id: "tgl1",
  value: "card",
  enabled: true,
  path: "payments.card",
  level: 1,
  parent_id: "1",
  app_id: "app1",
  has_activation_rule: false,
  activation_rule: null,
};

describe("EditToggleDrawer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the toggle and shows its path and current status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, toggle)));

    render(<EditToggleDrawer applicationId="app1" toggleId="tgl1" childrenCount={0} onClose={vi.fn()} onSaved={vi.fn()} onPendingApproval={vi.fn()} />);

    expect(await screen.findByText("payments.card")).toBeInTheDocument();
    expect(screen.getByText(/^enabled$/i)).toBeInTheDocument();
  });

  it("shows a cascade warning when the toggle has children", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, toggle)));

    render(<EditToggleDrawer applicationId="app1" toggleId="tgl1" childrenCount={3} onClose={vi.fn()} onSaved={vi.fn()} onPendingApproval={vi.fn()} />);

    expect(await screen.findByText(/3/)).toBeInTheDocument();
    expect(screen.getByText(/cascades down/i)).toBeInTheDocument();
  });

  it("reveals rule type options and a value field once the rule switch is turned on", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, toggle)));
    const user = userEvent.setup();

    render(<EditToggleDrawer applicationId="app1" toggleId="tgl1" childrenCount={0} onClose={vi.fn()} onSaved={vi.fn()} onPendingApproval={vi.fn()} />);
    await screen.findByText("payments.card");

    await user.click(screen.getByRole("button", { name: /activation rule/i }));

    expect(screen.getByText("Percentage")).toBeInTheDocument();
    expect(screen.getByText("Canary")).toBeInTheDocument();
  });

  it("saves enabled + activation rule and calls onSaved", async () => {
    const fetchMock = vi.fn().mockImplementation((_path: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return Promise.resolve(
          jsonResponse(200, { ...toggle, has_activation_rule: true, activation_rule: { type: "percentage", value: "25" } })
        );
      }
      return Promise.resolve(jsonResponse(200, toggle));
    });
    vi.stubGlobal("fetch", fetchMock);
    const onSaved = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<EditToggleDrawer applicationId="app1" toggleId="tgl1" childrenCount={0} onClose={onClose} onSaved={onSaved} onPendingApproval={vi.fn()} />);
    await screen.findByText("payments.card");

    await user.click(screen.getByRole("button", { name: /activation rule/i }));
    await user.click(screen.getByText("Percentage"));
    await user.type(screen.getByLabelText(/percentage value/i), "25");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/applications/app1/toggles/tgl1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ enabled: true, has_activation_rule: true, activation_rule: { type: "percentage", value: "25" } }),
      })
    );
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("blocks saving with the rule on but no value typed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, toggle)));
    const onSaved = vi.fn();
    const user = userEvent.setup();

    render(<EditToggleDrawer applicationId="app1" toggleId="tgl1" childrenCount={0} onClose={vi.fn()} onSaved={onSaved} onPendingApproval={vi.fn()} />);
    await screen.findByText("payments.card");

    await user.click(screen.getByRole("button", { name: /activation rule/i }));
    await user.click(screen.getByText("Percentage"));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText(/value is required/i)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("calls onPendingApproval (not onSaved) on a 202 response", async () => {
    const fetchMock = vi.fn().mockImplementation((_path: string, init?: RequestInit) => {
      if (init?.method === "PUT") return Promise.resolve(jsonResponse(202, { approval_required: true, action_type: "toggle_rule" }));
      return Promise.resolve(jsonResponse(200, toggle));
    });
    vi.stubGlobal("fetch", fetchMock);
    const onSaved = vi.fn();
    const onPendingApproval = vi.fn();
    const user = userEvent.setup();

    render(<EditToggleDrawer applicationId="app1" toggleId="tgl1" childrenCount={0} onClose={vi.fn()} onSaved={onSaved} onPendingApproval={onPendingApproval} />);
    await screen.findByText("payments.card");

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await vi.waitFor(() => expect(onPendingApproval).toHaveBeenCalledWith("toggle_rule"));
    expect(onSaved).not.toHaveBeenCalled();
  });
});
