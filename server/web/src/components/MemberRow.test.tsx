import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemberRow } from "./MemberRow";
import type { User } from "../types/user";

const member: User = {
  id: "1",
  username: "alice",
  role: "admin",
  must_change_password: false,
  created_at: "",
  updated_at: "",
};

describe("MemberRow", () => {
  it("shows the username and initials", () => {
    render(<MemberRow member={member} />);

    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("calls onRemove when the remove button is clicked", async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(<MemberRow member={member} onRemove={onRemove} />);

    await user.click(screen.getByRole("button", { name: /remove member/i }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("does not render a remove button when onRemove is not provided", () => {
    render(<MemberRow member={member} />);

    expect(screen.queryByRole("button", { name: /remove member/i })).not.toBeInTheDocument();
  });
});
