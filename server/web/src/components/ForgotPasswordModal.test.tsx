import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordModal } from "./ForgotPasswordModal";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("ForgotPasswordModal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("submits the typed username and shows the confirmed success copy", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ForgotPasswordModal onClose={vi.fn()} />);

    await user.type(screen.getByLabelText(/username/i), "Marina");
    await user.click(screen.getByRole("button", { name: /request reset/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/forgot-password",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ username: "marina" }) })
    );
    expect(await screen.findByText(/an administrator has been notified/i)).toBeInTheDocument();
    expect(screen.getByText("@marina", { exact: false })).toBeInTheDocument();
  });

  it("does nothing when Request reset is clicked with an empty username", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ForgotPasswordModal onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /request reset/i }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits on Enter in the username field", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ForgotPasswordModal onClose={vi.fn()} />);
    await user.type(screen.getByLabelText(/username/i), "marina{Enter}");

    expect(await screen.findByText(/an administrator has been notified/i)).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked before submitting", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ForgotPasswordModal onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Done is clicked after a successful request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true })));
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<ForgotPasswordModal onClose={onClose} />);
    await user.type(screen.getByLabelText(/username/i), "marina");
    await user.click(screen.getByRole("button", { name: /request reset/i }));
    await screen.findByText(/an administrator has been notified/i);

    await user.click(screen.getByRole("button", { name: /done/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows an inline error and stays in the form when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, { error: "boom" })));
    const user = userEvent.setup();

    render(<ForgotPasswordModal onClose={vi.fn()} />);
    await user.type(screen.getByLabelText(/username/i), "marina");
    await user.click(screen.getByRole("button", { name: /request reset/i }));

    expect(await screen.findByText("boom")).toBeInTheDocument();
    expect(screen.queryByText(/an administrator has been notified/i)).not.toBeInTheDocument();
  });
});
