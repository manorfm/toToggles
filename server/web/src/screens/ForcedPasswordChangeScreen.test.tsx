import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ForcedPasswordChangeScreen } from "./ForcedPasswordChangeScreen";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={["/change-password"]}>
      <Routes>
        <Route path="/change-password" element={<ForcedPasswordChangeScreen />} />
        <Route path="/login" element={<div>Login screen</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ForcedPasswordChangeScreen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("shows a message and no form when there is no pending password-change session", () => {
    renderScreen();

    expect(screen.getByText(/sessão .* expirou/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument();
  });

  it("submits the pending user's id/username and redirects to /login on success", async () => {
    sessionStorage.setItem("password_change_user", JSON.stringify({ user_id: "01ABC", username: "root" }));
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, message: "Password changed successfully" }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen();

    await user.type(screen.getByLabelText(/current password/i), "temp-pass");
    await user.type(screen.getByLabelText(/^new password/i), "NovaSenha123");
    await user.type(screen.getByLabelText(/confirm new password/i), "NovaSenha123");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText("Login screen")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/auth/change-password-first-time",
      expect.objectContaining({
        body: JSON.stringify({ user_id: "01ABC", username: "root", current_password: "temp-pass", new_password: "NovaSenha123" }),
      })
    );
    expect(sessionStorage.getItem("password_change_user")).toBeNull();
  });
});
