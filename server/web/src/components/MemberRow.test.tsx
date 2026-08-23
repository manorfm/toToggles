import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemberRow } from "./MemberRow";
import type { TeamApprover } from "../types/team";

const admin: TeamApprover = { team_id: "team1", user_id: "1", is_approver: false, username: "alice", role: "admin" };
const rootMember: TeamApprover = { team_id: "team1", user_id: "2", is_approver: false, username: "root", role: "root" };
const plainUser: TeamApprover = { team_id: "team1", user_id: "3", is_approver: false, username: "carol", role: "user" };

describe("MemberRow", () => {
  it("shows the username and initials", () => {
    render(<MemberRow member={admin} />);

    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("calls onRemove when the remove button is clicked", async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(<MemberRow member={admin} onRemove={onRemove} />);

    await user.click(screen.getByRole("button", { name: /remove member/i }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("does not render a remove button when onRemove is not provided", () => {
    render(<MemberRow member={admin} />);

    expect(screen.queryByRole("button", { name: /remove member/i })).not.toBeInTheDocument();
  });

  it("shows an 'Aprovador' badge when the member is already an approver", () => {
    render(<MemberRow member={{ ...admin, is_approver: true }} />);

    expect(screen.getByText("Aprovador")).toBeInTheDocument();
  });

  it("does not show the badge when the member isn't an approver", () => {
    render(<MemberRow member={admin} />);

    expect(screen.queryByText("Aprovador")).not.toBeInTheDocument();
  });

  it("offers the approver switch for an admin member when onToggleApprover is given", async () => {
    const onToggleApprover = vi.fn();
    const user = userEvent.setup();
    render(<MemberRow member={admin} onToggleApprover={onToggleApprover} />);

    await user.click(screen.getByRole("switch"));

    expect(onToggleApprover).toHaveBeenCalledTimes(1);
  });

  it("does not offer the approver switch for a plain 'user' role (only admin/root can be approvers)", () => {
    render(<MemberRow member={plainUser} onToggleApprover={vi.fn()} />);

    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("does not offer the approver switch for the root member (self-management is never exposed here)", () => {
    render(<MemberRow member={rootMember} onToggleApprover={vi.fn()} />);

    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("does not offer the approver switch when onToggleApprover is not provided", () => {
    render(<MemberRow member={admin} />);

    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });
});
