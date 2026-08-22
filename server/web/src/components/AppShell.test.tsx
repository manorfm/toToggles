import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderShell(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<div>Applications content</div>} />
          <Route path="/account/security" element={<div>Account security content</div>} />
        </Route>
        <Route path="/login" element={<div>Login screen</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("AppShell", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the sidebar, topbar and routed content once authenticated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, { success: true, user: { id: "1", username: "root", role: "root", must_change_password: false } })
      )
    );

    renderShell();

    expect(await screen.findByText("Applications content")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /applications/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /teams/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /approvals/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /history/i })).toBeInTheDocument();
    expect(screen.getByText("root")).toBeInTheDocument();
  });

  it("redirects to /login when there is no valid session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { error: "Authorization token required" })));

    renderShell();

    expect(await screen.findByText("Login screen")).toBeInTheDocument();
  });

  it("logs out and redirects to /login when 'Sign out' is used", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === "/auth/logout") return Promise.resolve(jsonResponse(200, { success: true, message: "Logged out successfully" }));
      return Promise.resolve(
        jsonResponse(200, { success: true, user: { id: "1", username: "root", role: "root", must_change_password: false } })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderShell();
    await screen.findByText("Applications content");

    await user.click(screen.getByRole("button", { name: /root/i }));
    await user.click(screen.getByRole("button", { name: /sign out/i }));

    expect(await screen.findByText("Login screen")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/auth/logout", expect.objectContaining({ method: "POST" }));
  });

  it("navigates to /account/security when 'Change password' is used", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, { success: true, user: { id: "1", username: "root", role: "root", must_change_password: false } })
      )
    );
    const user = userEvent.setup();

    renderShell();
    await screen.findByText("Applications content");

    await user.click(screen.getByRole("button", { name: /root/i }));
    await user.click(screen.getByRole("button", { name: /change password/i }));

    expect(await screen.findByText("Account security content")).toBeInTheDocument();
  });
});
