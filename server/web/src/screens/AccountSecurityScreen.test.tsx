import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountSecurityScreen } from "./AccountSecurityScreen";
import { ToastProvider } from "../components/ToastProvider";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderScreen() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/account/security"]}>
        <Routes>
          <Route path="/account/security" element={<AccountSecurityScreen />} />
          <Route path="/" element={<div>Applications content</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );
}

describe("AccountSecurityScreen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("submits current/new password and returns to the dashboard on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, message: "Password changed successfully" }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderScreen();

    await user.type(screen.getByLabelText(/current password/i), "old-pass");
    await user.type(screen.getByLabelText(/^new password/i), "NovaSenha123");
    await user.type(screen.getByLabelText(/confirm new password/i), "NovaSenha123");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText("Applications content")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/profile/change-password",
      expect.objectContaining({ body: JSON.stringify({ current_password: "old-pass", new_password: "NovaSenha123" }) })
    );
  });
});
