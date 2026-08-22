import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateTeamModal } from "./CreateTeamModal";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("CreateTeamModal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("blocks submit with an empty name", async () => {
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<CreateTeamModal onClose={vi.fn()} onCreated={onCreated} />);

    await user.click(screen.getByRole("button", { name: /create team/i }));

    expect(await screen.findByText(/team name is required/i)).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("creates the team and calls onCreated with the result", async () => {
    const createdTeam = { id: "01TEAM03", name: "Data Platform", description: "", created_at: "", updated_at: "" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(201, { success: true, team: createdTeam })));
    const onCreated = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<CreateTeamModal onClose={onClose} onCreated={onCreated} />);
    await user.type(screen.getByLabelText(/team name/i), "Data Platform");
    await user.click(screen.getByRole("button", { name: /create team/i }));

    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith(createdTeam));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the server's error message on a duplicate name, without closing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(400, { success: false, error: "team name already exists" })));
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<CreateTeamModal onClose={onClose} onCreated={vi.fn()} />);
    await user.type(screen.getByLabelText(/team name/i), "Payments Squad");
    await user.click(screen.getByRole("button", { name: /create team/i }));

    expect(await screen.findByText(/team name already exists/i)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
