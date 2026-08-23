import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateUserModal } from "./CreateUserModal";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("CreateUserModal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a user with the chosen username/role and hands the result to onCreated", async () => {
    const user2 = { id: "2", username: "bob", role: "admin", must_change_password: true, created_at: "", updated_at: "" };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { success: true, user: user2, password: "Xk9$mQ2pLw#T" }));
    vi.stubGlobal("fetch", fetchMock);
    const onCreated = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<CreateUserModal onClose={onClose} onCreated={onCreated} />);

    await user.type(screen.getByLabelText(/username/i), "bob");
    await user.selectOptions(screen.getByLabelText(/role/i), "admin");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/users",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ username: "bob", role: "admin" }) })
    );
    expect(onCreated).toHaveBeenCalledWith({ user: user2, password: "Xk9$mQ2pLw#T" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("requires a username before submitting", async () => {
    const user = userEvent.setup();
    render(<CreateUserModal onClose={vi.fn()} onCreated={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /^create$/i }));

    expect(await screen.findByText(/username is required/i)).toBeInTheDocument();
  });

  it("shows the server error on a duplicate username without closing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(409, { code: "T0003", message: "username already exists" })));
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<CreateUserModal onClose={onClose} onCreated={vi.fn()} />);
    await user.type(screen.getByLabelText(/username/i), "bob");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    expect(await screen.findByText("username already exists")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
