import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UserRow } from "./UserRow";
import type { User } from "../types/user";

const bob: User = { id: "2", username: "bob", role: "admin", must_change_password: false, created_at: "", updated_at: "" };
const rootUser: User = { id: "1", username: "root", role: "root", must_change_password: false, created_at: "", updated_at: "" };

describe("UserRow", () => {
  it("shows the username and current role", () => {
    render(<UserRow user={bob} isSelf={false} onRoleChange={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText("bob")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("admin");
  });

  it("calls onRoleChange with the new role when changed", async () => {
    const onRoleChange = vi.fn();
    const user = userEvent.setup();
    render(<UserRow user={bob} isSelf={false} onRoleChange={onRoleChange} onDelete={vi.fn()} />);

    await user.selectOptions(screen.getByRole("combobox"), "user");

    expect(onRoleChange).toHaveBeenCalledWith("user");
  });

  it("does not offer 'Root' as a role option for someone else's account", () => {
    render(<UserRow user={bob} isSelf={false} onRoleChange={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.queryByRole("option", { name: "Root" })).not.toBeInTheDocument();
  });

  it("offers 'Root' as a role option only when editing your own account", () => {
    render(<UserRow user={rootUser} isSelf onRoleChange={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByRole("option", { name: "Root" })).toBeInTheDocument();
  });

  it("calls onDelete when the delete button is clicked", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(<UserRow user={bob} isSelf={false} onRoleChange={vi.fn()} onDelete={onDelete} />);

    await user.click(screen.getByRole("button", { name: /delete user/i }));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("does not render a delete button for your own account (self-delete is refused by the API)", () => {
    render(<UserRow user={rootUser} isSelf onRoleChange={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /delete user/i })).not.toBeInTheDocument();
  });
});
