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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { message: "ok", data: [] })));

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
        jsonResponse(200, {
          message: "ok",
          data: added ? [{ team_id: "team1", user_id: "2", is_approver: false, username: "bob", role: "user" }] : [],
        })
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
        jsonResponse(200, {
          message: "ok",
          data: removed ? [] : [{ team_id: "team1", user_id: "1", is_approver: false, username: "alice", role: "admin" }],
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<TeamMembersSection teamId="team1" teamName="Payments Squad" />);
    await screen.findByText("alice");

    await user.click(screen.getByRole("button", { name: /remove member/i }));

    expect(await screen.findByText(/no members yet/i)).toBeInTheDocument();
  });

  it("toggles a member's approver status", async () => {
    let isApprover = false;
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/teams/team1/approvers/1" && init?.method === "POST") {
        isApprover = true;
        return Promise.resolve(jsonResponse(200, { data: [{ team_id: "team1", user_id: "1", is_approver: true, username: "alice", role: "admin" }] }));
      }
      return Promise.resolve(
        jsonResponse(200, { message: "ok", data: [{ team_id: "team1", user_id: "1", is_approver: isApprover, username: "alice", role: "admin" }] })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<TeamMembersSection teamId="team1" teamName="Payments Squad" />);
    await screen.findByText("alice");

    await user.click(screen.getByRole("switch"));

    expect(fetchMock).toHaveBeenCalledWith(
      "/teams/team1/approvers/1",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ is_approver: true }) })
    );
    await vi.waitFor(() => expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true"));
  });

  it("shows the server's error message when the approval workflow isn't enabled", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/teams/team1/approvers/1" && init?.method === "POST") {
        return Promise.resolve(jsonResponse(403, { code: "T0001", message: "approval system must be enabled" }));
      }
      return Promise.resolve(
        jsonResponse(200, { message: "ok", data: [{ team_id: "team1", user_id: "1", is_approver: false, username: "alice", role: "admin" }] })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<TeamMembersSection teamId="team1" teamName="Payments Squad" />);
    await screen.findByText("alice");

    await user.click(screen.getByRole("switch"));

    expect(await screen.findByText("approval system must be enabled")).toBeInTheDocument();
  });
});
