import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddMemberModal } from "./AddMemberModal";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const users = [
  { id: "1", username: "alice", role: "admin", must_change_password: false, created_at: "", updated_at: "" },
  { id: "2", username: "bob", role: "user", must_change_password: false, created_at: "", updated_at: "" },
];

describe("AddMemberModal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists users who are not already members", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, users })));

    render(<AddMemberModal teamId="team1" teamName="Payments Squad" existingMemberIds={["1"]} onClose={vi.fn()} onAdded={vi.fn()} />);

    expect(await screen.findByRole("option", { name: "bob" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "alice" })).not.toBeInTheDocument();
  });

  it("shows a hint and disables submit when every user is already a member", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, users })));

    render(<AddMemberModal teamId="team1" teamName="Payments Squad" existingMemberIds={["1", "2"]} onClose={vi.fn()} onAdded={vi.fn()} />);

    expect(await screen.findByText(/já são membros/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add member/i })).toBeDisabled();
  });

  it("adds the selected user and calls onAdded", async () => {
    const fetchMock = vi.fn().mockImplementation((_path: string, init?: RequestInit) => {
      if (init?.method === "POST") return Promise.resolve(jsonResponse(200, { success: true, message: "User added to team successfully" }));
      return Promise.resolve(jsonResponse(200, { success: true, users }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const onAdded = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<AddMemberModal teamId="team1" teamName="Payments Squad" existingMemberIds={["1"]} onClose={onClose} onAdded={onAdded} />);
    await screen.findByRole("option", { name: "bob" });

    await user.click(screen.getByRole("button", { name: /add member/i }));

    expect(fetchMock).toHaveBeenCalledWith("/teams/team1/users", expect.objectContaining({ method: "POST", body: JSON.stringify({ user_id: "2" }) }));
    await vi.waitFor(() => expect(onAdded).toHaveBeenCalledWith(users[1]));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
