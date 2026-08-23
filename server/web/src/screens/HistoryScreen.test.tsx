import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HistoryScreen } from "./HistoryScreen";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("HistoryScreen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows an empty state when there is no history yet", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { message: "ok", data: [] })));

    render(<HistoryScreen />);

    expect(await screen.findByText(/nothing here yet/i)).toBeInTheDocument();
  });

  it("lists every request, newest first, read-only (no action buttons)", async () => {
    const older = {
      id: "1",
      action_type: "toggle_delete",
      description: "",
      requested_by: "u1",
      team_id: "t1",
      status: "approved",
      expires_at: "",
      created_at: "2026-08-19T10:00:00Z",
      updated_at: "",
      requester_name: "alice",
      team_name: "Payments Squad",
    };
    const newer = { ...older, id: "2", action_type: "application_create", created_at: "2026-08-20T10:00:00Z", status: "pending" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { message: "ok", data: [older, newer] })));

    render(<HistoryScreen />);

    const actions = await screen.findAllByText(/create application|delete toggle/i);
    expect(actions[0]).toHaveTextContent(/create application/i);
    expect(actions[1]).toHaveTextContent(/delete toggle/i);
    expect(screen.queryByRole("button", { name: /^approve$/i })).not.toBeInTheDocument();
  });
});
