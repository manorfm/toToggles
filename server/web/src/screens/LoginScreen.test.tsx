import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginScreen } from "./LoginScreen";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("LoginScreen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a validation message instead of calling the API when fields are empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { first_access: false })));
    const user = userEvent.setup();
    render(<LoginScreen />);

    await user.click(screen.getByRole("button", { name: /entrar/i }));

    expect(await screen.findByText(/preencha usuário e senha/i)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith("/auth/login", expect.anything());
  });

  it("shows the server's error message on failed login", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === "/auth/check-first-access") return Promise.resolve(jsonResponse(200, { first_access: false }));
      return Promise.resolve(jsonResponse(401, { success: false, error: "Invalid username or password" }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<LoginScreen />);

    await user.type(screen.getByLabelText(/usuário/i), "root");
    await user.type(screen.getByLabelText(/senha/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /entrar/i }));

    expect(await screen.findByText(/invalid username or password/i)).toBeInTheDocument();
  });

  it("shows the default-credentials hint on first access", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { first_access: true, user_count: 0 })));
    render(<LoginScreen />);

    await waitFor(() => expect(screen.getByText(/primeiro acesso/i)).toBeInTheDocument());
  });

  // v2.6 §5.5: link "Forgot password?" abre o modal correspondente.
  it("opens the forgot-password modal from the link, and it closes independently of the login form", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { first_access: false })));
    const user = userEvent.setup();
    render(<LoginScreen />);

    await user.click(screen.getByRole("button", { name: /forgot password/i }));

    expect(await screen.findByText("Forgot your password?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByText("Forgot your password?")).not.toBeInTheDocument();
    // O formulário de login continua intacto (o modal é uma camada separada).
    expect(screen.getByRole("button", { name: /entrar/i })).toBeInTheDocument();
  });
});
