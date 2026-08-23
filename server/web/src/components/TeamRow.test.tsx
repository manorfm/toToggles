import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TeamRow } from "./TeamRow";
import type { TeamWithCounts } from "../types/team";

const team: TeamWithCounts = {
  id: "01TEAM01",
  name: "Payments Squad",
  description: "Owns payments features",
  created_at: "",
  updated_at: "",
  user_count: 3,
  application_count: 2,
};

describe("TeamRow", () => {
  it("shows the team name, description and counts", () => {
    render(<TeamRow team={team} />);

    expect(screen.getByText("Payments Squad")).toBeInTheDocument();
    expect(screen.getByText("Owns payments features")).toBeInTheDocument();
    expect(screen.getByText("3 members")).toBeInTheDocument();
    expect(screen.getByText("2 applications")).toBeInTheDocument();
  });

  it("uses singular wording for a count of one", () => {
    render(<TeamRow team={{ ...team, user_count: 1, application_count: 1 }} />);

    expect(screen.getByText("1 member")).toBeInTheDocument();
    expect(screen.getByText("1 application")).toBeInTheDocument();
  });

  it("calls onDelete with the team id when the delete button is clicked", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(<TeamRow team={team} onDelete={onDelete} />);

    await user.click(screen.getByRole("button", { name: /delete team/i }));

    expect(onDelete).toHaveBeenCalledWith("01TEAM01");
  });

  it("does not render a delete button when onDelete is not provided", () => {
    render(<TeamRow team={team} />);

    expect(screen.queryByRole("button", { name: /delete team/i })).not.toBeInTheDocument();
  });
});
