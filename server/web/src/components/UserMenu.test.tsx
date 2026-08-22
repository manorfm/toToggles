import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UserMenu } from "./UserMenu";

describe("UserMenu", () => {
  it("calls onLogout when 'Sign out' is clicked", async () => {
    const onLogout = vi.fn();
    const onChangePassword = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <UserMenu
        user={{ id: "1", username: "root", role: "root", must_change_password: false }}
        onLogout={onLogout}
        onChangePassword={onChangePassword}
        onClose={onClose}
      />
    );

    await user.click(screen.getByRole("button", { name: /sign out/i }));

    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("calls onChangePassword when 'Change password' is clicked", async () => {
    const onChangePassword = vi.fn();
    const user = userEvent.setup();

    render(
      <UserMenu
        user={{ id: "1", username: "root", role: "admin", must_change_password: false }}
        onLogout={vi.fn()}
        onChangePassword={onChangePassword}
        onClose={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /change password/i }));

    expect(onChangePassword).toHaveBeenCalledTimes(1);
  });
});
