import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserModal } from "./UserModal";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("UserModal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads team options and creates a user with the selected team/role", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === "/api/teams") return Promise.resolve(jsonResponse(200, { success: true, teams: [{ id: "t1", name: "Payments Squad" }] }));
      return Promise.resolve(
        jsonResponse(201, { success: true, user: { id: "9", username: "ana.ribeiro", role: "user" }, password: "abc123" })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const onCreated = vi.fn();
    const user = userEvent.setup();

    render(<UserModal isRoot onClose={vi.fn()} onCreated={onCreated} />);

    expect(await screen.findByRole("option", { name: "Payments Squad" })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/username/i), "ana.ribeiro");
    await user.click(screen.getByRole("button", { name: /^criar usuário$/i }));

    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ password: "abc123" })));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/users",
      expect.objectContaining({ body: JSON.stringify({ username: "ana.ribeiro", role: "user", team_id: "t1", is_approver: false }) })
    );
  });

  it("keeps the 'Aprovador do time' field mounted (animated reveal) but hidden until root selects role Admin", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, teams: [{ id: "t1", name: "Payments Squad" }] })));
    const user = userEvent.setup();

    render(<UserModal isRoot onClose={vi.fn()} onCreated={vi.fn()} />);
    await screen.findByRole("option", { name: "Payments Squad" });

    const wrapper = screen.getByText("Aprovador do time").closest(".toggle-field-wrap");
    expect(wrapper).toHaveAttribute("aria-hidden", "true");
    // { hidden: true }: getByRole por padrão respeita a árvore de acessibilidade, que exclui
    // tudo dentro de aria-hidden="true" — precisa incluir explicitamente pra inspecionar o
    // switch enquanto escondido (o próprio ponto do teste).
    expect(screen.getByRole("switch", { name: /aprovador do time/i, hidden: true })).toHaveAttribute("tabindex", "-1");

    await user.selectOptions(screen.getByLabelText(/papel/i), "admin");
    expect(wrapper).toHaveAttribute("aria-hidden", "false");
    expect(screen.getByRole("switch", { name: /aprovador do time/i })).toHaveAttribute("tabindex", "0");
  });

  it("names the selected team in the 'Aprovador do time' hint", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, teams: [{ id: "t1", name: "Payments Squad" }] })));
    const user = userEvent.setup();

    render(<UserModal isRoot onClose={vi.fn()} onCreated={vi.fn()} />);
    await screen.findByRole("option", { name: "Payments Squad" });
    await user.selectOptions(screen.getByLabelText(/papel/i), "admin");

    expect(screen.getByText(/do time Payments Squad/i)).toBeInTheDocument();
  });

  it("never shows the approver switch for a non-root (admin) creator, even with role Admin selected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, teams: [{ id: "t1", name: "Payments Squad" }] })));
    const user = userEvent.setup();

    render(<UserModal isRoot={false} onClose={vi.fn()} onCreated={vi.fn()} />);
    await screen.findByRole("option", { name: "Payments Squad" });

    await user.selectOptions(screen.getByLabelText(/papel/i), "admin");
    expect(screen.queryByText("Aprovador do time")).not.toBeInTheDocument();
  });

  it("sends is_approver true when the switch is toggled on", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path === "/api/teams") return Promise.resolve(jsonResponse(200, { success: true, teams: [{ id: "t1", name: "Payments Squad" }] }));
      return Promise.resolve(jsonResponse(201, { success: true, user: { id: "9", username: "x" }, password: "abc" }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<UserModal isRoot onClose={vi.fn()} onCreated={vi.fn()} />);
    await screen.findByRole("option", { name: "Payments Squad" });
    await user.selectOptions(screen.getByLabelText(/papel/i), "admin");
    await user.click(screen.getByRole("switch", { name: /aprovador do time/i }));
    await user.type(screen.getByLabelText(/username/i), "x");
    await user.click(screen.getByRole("button", { name: /^criar usuário$/i }));

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/users",
        expect.objectContaining({ body: JSON.stringify({ username: "x", role: "admin", team_id: "t1", is_approver: true }) })
      )
    );
  });

  it("shows a hint and disables submit when there are no team options", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, teams: [] })));

    render(<UserModal isRoot={false} onClose={vi.fn()} onCreated={vi.fn()} />);

    expect(await screen.findByText(/precisa estar em um time/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^criar usuário$/i })).toBeDisabled();
  });

  it("shows the server's error message without closing on a duplicate username", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/teams") return Promise.resolve(jsonResponse(200, { success: true, teams: [{ id: "t1", name: "Payments Squad" }] }));
      if (init?.method === "POST") return Promise.resolve(jsonResponse(409, { code: "T0003", message: "username already exists" }));
      return Promise.resolve(jsonResponse(200, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<UserModal isRoot onClose={onClose} onCreated={vi.fn()} />);
    await screen.findByRole("option", { name: "Payments Squad" });
    await user.type(screen.getByLabelText(/username/i), "bob");
    await user.click(screen.getByRole("button", { name: /^criar usuário$/i }));

    expect(await screen.findByText(/username already exists/i)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
