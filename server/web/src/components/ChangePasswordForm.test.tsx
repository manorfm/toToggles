import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { ApiError } from "../api/client";

describe("ChangePasswordForm", () => {
  it("blocks submit and shows a message when the new password is shorter than 4 characters", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ChangePasswordForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/current password/i), "old");
    await user.type(screen.getByLabelText(/^new password/i), "abc");
    await user.type(screen.getByLabelText(/confirm new password/i), "abc");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText(/at least 4 characters/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("blocks submit when the confirmation does not match", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ChangePasswordForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/current password/i), "old");
    await user.type(screen.getByLabelText(/^new password/i), "NovaSenha123");
    await user.type(screen.getByLabelText(/confirm new password/i), "different");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText(/don't match/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onSubmit with the current and new password once valid", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ChangePasswordForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/current password/i), "old-pass");
    await user.type(screen.getByLabelText(/^new password/i), "NovaSenha123");
    await user.type(screen.getByLabelText(/confirm new password/i), "NovaSenha123");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    expect(onSubmit).toHaveBeenCalledWith({ currentPassword: "old-pass", newPassword: "NovaSenha123" });
  });

  it("shows the server's error message when onSubmit rejects", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(401, "Current password is incorrect"));
    const user = userEvent.setup();
    render(<ChangePasswordForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/current password/i), "wrong");
    await user.type(screen.getByLabelText(/^new password/i), "NovaSenha123");
    await user.type(screen.getByLabelText(/confirm new password/i), "NovaSenha123");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText(/current password is incorrect/i)).toBeInTheDocument();
  });
});
