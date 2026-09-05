import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingModal } from "./OnboardingModal";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderModal(overrides: Partial<Parameters<typeof OnboardingModal>[0]> = {}) {
  const onClose = vi.fn();
  const utils = render(
    <OnboardingModal existingTeams={[]} existingApps={[]} existingUsernames={[]} onClose={onClose} {...overrides} />
  );
  return { ...utils, onClose };
}

describe("OnboardingModal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("starts on the Welcome step and skipping marks onboarded without creating anything", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { onClose } = renderModal();

    expect(screen.getByText("Set up toToggle in 6 steps")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /skip tour/i }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("totoggle_v2_onboarded")).toBe("1");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("advances to the Team step on 'Start setup', showing the progress indicator", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole("button", { name: /start setup/i }));

    expect(screen.getByText("Create your first team")).toBeInTheDocument();
    expect(screen.getByText("Teams", { selector: ".ops-lbl" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^next/i })).toBeDisabled();
  });

  it("creates the team on Next, then advances to People — dedupe skips the API call when the name already exists", async () => {
    const createTeamCalls: unknown[] = [];
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/teams" && init?.method === "POST") {
        createTeamCalls.push(JSON.parse(init.body as string));
        return Promise.resolve(jsonResponse(201, { success: true, team: { id: "team-new", name: "Payments" } }));
      }
      return Promise.resolve(jsonResponse(200, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole("button", { name: /start setup/i }));
    await user.type(screen.getByLabelText("Team name"), "Payments");
    await user.click(screen.getByRole("button", { name: /^next/i }));

    expect(await screen.findByText(/add someone to/i)).toBeInTheDocument();
    expect(createTeamCalls).toEqual([{ name: "Payments", description: "" }]);
  });

  it("reuses an existing team by name (case-insensitive) instead of creating a duplicate", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/teams" && init?.method === "POST") {
        throw new Error("must not create a duplicate team");
      }
      return Promise.resolve(jsonResponse(200, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderModal({ existingTeams: [{ id: "team-1", name: "payments" }] });

    await user.click(screen.getByRole("button", { name: /start setup/i }));
    await user.type(screen.getByLabelText("Team name"), "Payments");
    await user.click(screen.getByRole("button", { name: /^next/i }));

    expect(await screen.findByText(/add someone to/i)).toBeInTheDocument();
  });

  it("shows the server's error and stays on the same step when team creation fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(403, { code: "A0001", message: "root privileges required" })));
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole("button", { name: /start setup/i }));
    await user.type(screen.getByLabelText("Team name"), "Payments");
    await user.click(screen.getByRole("button", { name: /^next/i }));

    expect(await screen.findByText("root privileges required")).toBeInTheDocument();
    expect(screen.getByText("Create your first team")).toBeInTheDocument();
  });

  // Fluxo completo: Team -> People -> Application -> Toggle -> Key -> Integration, cada Next
  // disparando a chamada real esperada, terminando com "Open toToggle" marcando onboarded.
  it("walks the full wizard end to end, calling the real API at each step", async () => {
    const calls: { path: string; body: unknown }[] = [];
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (init?.body) calls.push({ path, body: JSON.parse(init.body as string) });
      if (path === "/api/teams" && init?.method === "POST") {
        return Promise.resolve(jsonResponse(201, { success: true, team: { id: "team-1", name: "Payments" } }));
      }
      if (path === "/api/users" && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse(201, {
            success: true,
            user: { id: "u1", name: "Ana Ribeiro", username: "ana.ribeiro", role: "user" },
            password: "Temp1234!",
          })
        );
      }
      if (path === "/api/applications" && init?.method === "POST") {
        return Promise.resolve(jsonResponse(201, { id: "app-1", name: "Checkout", created_at: "", updated_at: "" }));
      }
      if (path === "/api/applications/app-1/toggles" && init?.method === "POST") {
        return Promise.resolve(jsonResponse(201, { message: "toggle created successfully", path: "payments.card", enabled: true }));
      }
      if (path === "/api/applications/app-1/generate-secret" && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse(201, { message: "ok", secret_key: { id: "k1" }, plain_key: "sk_live_abc123" })
        );
      }
      return Promise.resolve(jsonResponse(200, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.click(screen.getByRole("button", { name: /start setup/i }));

    // Team
    await user.type(screen.getByLabelText("Team name"), "Payments");
    await user.click(screen.getByRole("button", { name: /^next/i }));

    // People
    await screen.findByText(/add someone to/i);
    await user.type(screen.getByLabelText("Full name"), "Ana Ribeiro");
    await user.click(screen.getByRole("button", { name: /^next/i }));

    // Application
    await screen.findByText("Create your first Application");
    await user.type(screen.getByLabelText("Application name"), "Checkout");
    await user.click(screen.getByRole("button", { name: /^next/i }));

    // Toggle
    await screen.findByText(/create the first toggle/i);
    await user.type(screen.getByLabelText("Toggle path"), "payments.card");
    await user.click(screen.getByRole("button", { name: /^next/i }));

    // Service key — optional, skip without generating
    await screen.findByText(/generate the key for/i);
    await user.click(screen.getByRole("button", { name: /^next/i }));

    // Integration
    expect(await screen.findByText("All set!")).toBeInTheDocument();
    expect(screen.getByText("Payments", { selector: "b" })).toBeInTheDocument();
    expect(screen.getByText(/ana\.ribeiro/)).toBeInTheDocument();
    expect(screen.getByText("Checkout", { selector: "b" })).toBeInTheDocument();
    expect(screen.getByText("payments.card", { selector: "code" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /open totoggle/i }));

    expect(window.localStorage.getItem("totoggle_v2_onboarded")).toBe("1");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      { path: "/api/teams", body: { name: "Payments", description: "" } },
      { path: "/api/users", body: { name: "Ana Ribeiro", username: "ana.ribeiro", role: "user", team_id: "team-1", is_approver: false } },
      { path: "/api/applications", body: { name: "Checkout", team_id: "team-1" } },
      { path: "/api/applications/app-1/toggles", body: { toggle: "payments.card" } },
    ]);
  });

  it("requires the 'I stored the key' checkbox before advancing past a generated key", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/teams" && init?.method === "POST") {
        return Promise.resolve(jsonResponse(201, { success: true, team: { id: "team-1", name: "Payments" } }));
      }
      if (path === "/api/users" && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse(201, { success: true, user: { id: "u1", name: "Ana", username: "ana" }, password: "Temp1234!" })
        );
      }
      if (path === "/api/applications" && init?.method === "POST") {
        return Promise.resolve(jsonResponse(201, { id: "app-1", name: "Checkout", created_at: "", updated_at: "" }));
      }
      if (path === "/api/applications/app-1/toggles" && init?.method === "POST") {
        return Promise.resolve(jsonResponse(201, { message: "toggle created successfully", path: "a.b", enabled: true }));
      }
      if (path === "/api/applications/app-1/generate-secret" && init?.method === "POST") {
        return Promise.resolve(jsonResponse(201, { message: "ok", secret_key: { id: "k1" }, plain_key: "sk_live_xyz" }));
      }
      return Promise.resolve(jsonResponse(200, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole("button", { name: /start setup/i }));
    await user.type(screen.getByLabelText("Team name"), "Payments");
    await user.click(screen.getByRole("button", { name: /^next/i }));
    await screen.findByText(/add someone to/i);
    await user.type(screen.getByLabelText("Full name"), "Ana");
    await user.click(screen.getByRole("button", { name: /^next/i }));
    await screen.findByText("Create your first Application");
    await user.type(screen.getByLabelText("Application name"), "Checkout");
    await user.click(screen.getByRole("button", { name: /^next/i }));
    await screen.findByText(/create the first toggle/i);
    await user.type(screen.getByLabelText("Toggle path"), "a.b");
    await user.click(screen.getByRole("button", { name: /^next/i }));

    await screen.findByText(/generate the key for/i);
    await user.click(screen.getByRole("button", { name: /generate service key/i }));

    expect(await screen.findByText("sk_live_xyz")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^next/i })).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: /i stored the key/i }));
    expect(screen.getByRole("button", { name: /^next/i })).toBeEnabled();
  });

  it("Back navigates to the previous step without re-creating the already-created team", async () => {
    let teamCreateCount = 0;
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/teams" && init?.method === "POST") {
        teamCreateCount++;
        return Promise.resolve(jsonResponse(201, { success: true, team: { id: "team-1", name: "Payments" } }));
      }
      return Promise.resolve(jsonResponse(200, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole("button", { name: /start setup/i }));
    await user.type(screen.getByLabelText("Team name"), "Payments");
    await user.click(screen.getByRole("button", { name: /^next/i }));
    await screen.findByText(/add someone to/i);

    await user.click(screen.getByRole("button", { name: /^back/i }));
    expect(screen.getByText("Create your first team")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^next/i }));
    await screen.findByText(/add someone to/i);

    expect(teamCreateCount).toBe(1);
  });
});
