import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UserRow } from "./UserRow";
import type { User } from "../types/user";

const baseUser: User = {
  id: "1",
  name: "Ana Ribeiro",
  username: "ana.ribeiro",
  role: "user",
  must_change_password: false,
  active: true,
  status: "active",
  teams: [{ id: "t1", name: "Payments Squad" }],
  created_at: "",
  updated_at: "",
};

describe("UserRow", () => {
  it("shows the full name, username, role, status and team names", () => {
    render(
      <UserRow user={baseUser} isSelf={false} manageable canDelete onResetPassword={vi.fn()} onToggleStatus={vi.fn()} onDelete={vi.fn()} />
    );

    expect(screen.getByText("Ana Ribeiro")).toBeInTheDocument();
    expect(screen.getByText("@ana.ribeiro")).toBeInTheDocument();
    expect(screen.getByText("User")).toBeInTheDocument();
    expect(screen.getByText("Ativo")).toBeInTheDocument();
    expect(screen.getByText("Payments Squad")).toBeInTheDocument();
  });

  // initials do avatar vêm do NOME completo (lib/userDisplay.ts#initialsOf), não do username —
  // confirmado no protótipo real (currentUser.initials sempre derivado de .name).
  it("derives the avatar initials from the full name, not the username", () => {
    render(
      <UserRow user={baseUser} isSelf={false} manageable canDelete onResetPassword={vi.fn()} onToggleStatus={vi.fn()} onDelete={vi.fn()} />
    );

    expect(screen.getByText("AR")).toBeInTheDocument();
  });

  it("shows a 'você' badge only for the current user's own row", () => {
    const { rerender } = render(
      <UserRow user={baseUser} isSelf={false} manageable={false} canDelete={false} onResetPassword={vi.fn()} onToggleStatus={vi.fn()} onDelete={vi.fn()} />
    );
    expect(screen.queryByText("você")).not.toBeInTheDocument();

    rerender(
      <UserRow user={baseUser} isSelf manageable={false} canDelete={false} onResetPassword={vi.fn()} onToggleStatus={vi.fn()} onDelete={vi.fn()} />
    );
    expect(screen.getByText("você")).toBeInTheDocument();
  });

  it("hides reset-password/toggle-status/delete actions when not manageable/deletable", () => {
    render(
      <UserRow user={baseUser} isSelf={false} manageable={false} canDelete={false} onResetPassword={vi.fn()} onToggleStatus={vi.fn()} onDelete={vi.fn()} />
    );

    expect(screen.queryByRole("button", { name: /resetar senha/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /desativar|reativar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /excluir/i })).not.toBeInTheDocument();
  });

  it("wires reset-password and toggle-status when manageable", async () => {
    const onResetPassword = vi.fn();
    const onToggleStatus = vi.fn();
    const user = userEvent.setup();
    render(
      <UserRow user={baseUser} isSelf={false} manageable canDelete={false} onResetPassword={onResetPassword} onToggleStatus={onToggleStatus} onDelete={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: /resetar senha/i }));
    expect(onResetPassword).toHaveBeenCalled();

    const toggleBtn = screen.getByRole("button", { name: /desativar/i });
    await user.click(toggleBtn);
    expect(onToggleStatus).toHaveBeenCalled();
  });

  it("labels the toggle-status button 'Reativar' for a disabled user", () => {
    render(
      <UserRow
        user={{ ...baseUser, status: "disabled", active: false }}
        isSelf={false}
        manageable
        canDelete={false}
        onResetPassword={vi.fn()}
        onToggleStatus={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /reativar/i })).toBeInTheDocument();
  });

  it("shows delete only when canDelete, independent of manageable", () => {
    const { rerender } = render(
      <UserRow user={baseUser} isSelf={false} manageable canDelete={false} onResetPassword={vi.fn()} onToggleStatus={vi.fn()} onDelete={vi.fn()} />
    );
    expect(screen.queryByRole("button", { name: /excluir/i })).not.toBeInTheDocument();

    rerender(
      <UserRow user={baseUser} isSelf={false} manageable={false} canDelete onResetPassword={vi.fn()} onToggleStatus={vi.fn()} onDelete={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: /excluir/i })).toBeInTheDocument();
  });

  it("shows '—' when the user has no teams", () => {
    render(
      <UserRow user={{ ...baseUser, teams: [] }} isSelf={false} manageable={false} canDelete={false} onResetPassword={vi.fn()} onToggleStatus={vi.fn()} onDelete={vi.fn()} />
    );

    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
