import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TeamMembersSection } from "./TeamMembersSection";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("TeamMembersSection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows an empty state when the team has no members", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, users: [] })));

    render(<TeamMembersSection teamId="team1" teamName="Payments Squad" />);

    expect(await screen.findByText(/no members yet/i)).toBeInTheDocument();
  });

  it("lists members and adds a new one via the modal", async () => {
    let added = false;
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/users") return Promise.resolve(jsonResponse(200, { success: true, users: [{ id: "2", username: "bob", role: "user", must_change_password: false, created_at: "", updated_at: "" }] }));
      if (init?.method === "POST") {
        added = true;
        return Promise.resolve(jsonResponse(200, { success: true, message: "ok" }));
      }
      return Promise.resolve(
        jsonResponse(200, { success: true, users: added ? [{ id: "2", username: "bob", role: "user", must_change_password: false, created_at: "", updated_at: "" }] : [] })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<TeamMembersSection teamId="team1" teamName="Payments Squad" />);
    await screen.findByText(/no members yet/i);

    await user.click(screen.getByRole("button", { name: /add member/i }));
    await screen.findByRole("option", { name: "bob" });
    await user.click(screen.getAllByRole("button", { name: /add member/i })[1]); // footer button inside modal

    expect(await screen.findByText("bob")).toBeInTheDocument();
  });

  it("removes a member", async () => {
    let removed = false;
    const fetchMock = vi.fn().mockImplementation((_path: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        removed = true;
        return Promise.resolve(jsonResponse(200, { success: true, message: "ok" }));
      }
      return Promise.resolve(
        jsonResponse(200, { success: true, users: removed ? [] : [{ id: "1", username: "alice", role: "admin", must_change_password: false, created_at: "", updated_at: "" }] })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<TeamMembersSection teamId="team1" teamName="Payments Squad" />);
    await screen.findByText("alice");

    await user.click(screen.getByRole("button", { name: /remove member/i }));

    expect(await screen.findByText(/no members yet/i)).toBeInTheDocument();
  });
});
