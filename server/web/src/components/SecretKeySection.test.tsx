import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SecretKeySection } from "./SecretKeySection";
import { ToastProvider } from "./ToastProvider";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function key(overrides: Partial<{ id: string; is_current: boolean; last_used_at: string | null }> = {}) {
  return {
    id: "1",
    name: "API Access Key",
    application_id: "app1",
    created_by: "u1",
    is_current: true,
    last_used_at: null,
    created_at: "2026-01-15T10:00:00Z",
    updated_at: "2026-01-15T10:00:00Z",
    ...overrides,
  };
}

const CURRENT_KEY = key();
const PREVIOUS_KEY = key({ id: "0", is_current: false });

describe("SecretKeySection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the illustrated empty state and a Generate CTA when there is no key yet (canManage)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, secret_keys: [] })));

    render(<SecretKeySection applicationId="app1" isRoot canManage />, { wrapper: ToastProvider });

    expect(await screen.findByText("No service key")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate service key/i })).toBeInTheDocument();
  });

  it("hides management actions when canManage is false", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, secret_keys: [] })));

    render(<SecretKeySection applicationId="app1" isRoot canManage={false} />, { wrapper: ToastProvider });

    await screen.findByText("No service key");
    expect(screen.queryByRole("button", { name: /generate service key/i })).not.toBeInTheDocument();
  });

  it("shows the current key's created/last-used and Rotate/Revoke actions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, secret_keys: [CURRENT_KEY] })));

    const { container } = render(<SecretKeySection applicationId="app1" isRoot canManage />, { wrapper: ToastProvider });

    await screen.findByText(/created/i);
    expect(container.querySelector(".ks-name")).toHaveTextContent("Service key");
    expect(screen.getByText(/created/i)).toBeInTheDocument();
    expect(screen.getByText(/last used/i)).toBeInTheDocument();
    expect(screen.getByText(/never/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /rotate key/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^revoke$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate new key/i })).toBeInTheDocument();
  });

  // v2.6 §5.6: last_used_at agora é tracking real (não mais "(demo — not tracked)") — quando
  // presente, mostra um horário relativo de verdade.
  it("shows a real relative last-used time when the key has been used", async () => {
    const recentlyUsed = key({ last_used_at: new Date(Date.now() - 5 * 60 * 1000).toISOString() });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, secret_keys: [recentlyUsed] })));

    render(<SecretKeySection applicationId="app1" isRoot canManage />, { wrapper: ToastProvider });

    expect(await screen.findByText(/5 min ago/i)).toBeInTheDocument();
    expect(screen.queryByText(/demo.*not tracked/i)).not.toBeInTheDocument();
  });

  it("hides the 'lost the key' card and rotate/revoke actions when canManage is false", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, secret_keys: [CURRENT_KEY] })));

    render(<SecretKeySection applicationId="app1" isRoot canManage={false} />, { wrapper: ToastProvider });

    await screen.findAllByText("Service key");
    expect(screen.queryByRole("button", { name: /rotate key/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^revoke$/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Lost the key?")).not.toBeInTheDocument();
  });

  // v2.6 §5.1: generating the very FIRST key for an application skips the rotate confirmation —
  // there is nothing to overlap with yet (confirmed prototype: `if (keys[appId]) {...}`, only
  // gated when a key already exists).
  it("generates the first key directly (no confirm) and opens the reveal-once modal", async () => {
    const fetchMock = vi.fn().mockImplementation((_path: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(jsonResponse(200, { success: true, secret_key: CURRENT_KEY, plain_key: "sk_abc123", warning: "shown once" }));
      }
      return Promise.resolve(jsonResponse(200, { success: true, secret_keys: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<SecretKeySection applicationId="app1" isRoot canManage />, { wrapper: ToastProvider });
    await screen.findByText("No service key");

    await user.click(screen.getByRole("button", { name: /generate service key/i }));

    expect(await screen.findByText("sk_abc123")).toBeInTheDocument();
  });

  // v2.6 §5.1: rotating when a key ALREADY exists shows the confirmed "Rotate service key?"
  // confirmation first, warning the current key is not revoked automatically.
  it("shows a rotate confirmation before generating a new key when one already exists, then reveals it", async () => {
    let posted = false;
    const fetchMock = vi.fn().mockImplementation((_path: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posted = true;
        return Promise.resolve(jsonResponse(200, { success: true, secret_key: key({ id: "2" }), plain_key: "sk_new456", warning: "shown once" }));
      }
      return Promise.resolve(jsonResponse(200, { success: true, secret_keys: [CURRENT_KEY] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<SecretKeySection applicationId="app1" isRoot canManage />, { wrapper: ToastProvider });
    await screen.findByRole("button", { name: /rotate key/i });

    await user.click(screen.getByRole("button", { name: /rotate key/i }));

    expect(await screen.findByText("Rotate service key?")).toBeInTheDocument();
    expect(screen.getByText(/update your consumers, then revoke it yourself/i)).toBeInTheDocument();
    expect(posted).toBe(false);

    await user.click(within(screen.getByTestId("modal-scrim")).getByRole("button", { name: /generate new key/i }));

    expect(posted).toBe(true);
    expect(await screen.findByText("sk_new456")).toBeInTheDocument();
  });

  it("cancelling the rotate confirmation never calls the API", async () => {
    let posted = false;
    const fetchMock = vi.fn().mockImplementation((_path: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posted = true;
        return Promise.resolve(jsonResponse(200, { success: true, secret_key: CURRENT_KEY, plain_key: "sk_x" }));
      }
      return Promise.resolve(jsonResponse(200, { success: true, secret_keys: [CURRENT_KEY] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<SecretKeySection applicationId="app1" isRoot canManage />, { wrapper: ToastProvider });
    await screen.findByRole("button", { name: /rotate key/i });
    await user.click(screen.getByRole("button", { name: /rotate key/i }));
    await screen.findByText("Rotate service key?");

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByText("Rotate service key?")).not.toBeInTheDocument();
    expect(posted).toBe(false);
  });

  // v2.6 §5.1: after a rotation, the previous key shows its own overlap notice with a
  // "Revoke previous now" action — reachable once the list includes an is_current:false entry.
  it("shows the previous-key overlap notice with a Revoke-previous action when a previous key exists", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, secret_keys: [CURRENT_KEY, PREVIOUS_KEY] })));

    render(<SecretKeySection applicationId="app1" isRoot canManage />, { wrapper: ToastProvider });

    expect(await screen.findByText(/previous key/i)).toBeInTheDocument();
    expect(screen.getByText(/rotation overlap window/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /revoke previous now/i })).toBeInTheDocument();
  });

  it("does not show the previous-key notice when there is no previous key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, secret_keys: [CURRENT_KEY] })));

    render(<SecretKeySection applicationId="app1" isRoot canManage />, { wrapper: ToastProvider });
    await screen.findAllByText("Service key");

    expect(screen.queryByText(/previous key/i)).not.toBeInTheDocument();
  });

  // Revoking the PREVIOUS key is immediate — no confirm modal (confirmed prototype:
  // revokePreviousKey() is called straight from the notice's button, unlike revoking current).
  it("revokes the previous key immediately, with no confirmation, and shows a toast", async () => {
    let revokedPreviousId = "";
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        revokedPreviousId = path.split("/").pop() ?? "";
        return Promise.resolve(jsonResponse(200, { success: true, message: "Secret key revoked successfully" }));
      }
      return Promise.resolve(
        jsonResponse(200, { success: true, secret_keys: revokedPreviousId ? [CURRENT_KEY] : [CURRENT_KEY, PREVIOUS_KEY] })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<SecretKeySection applicationId="app1" isRoot canManage />, { wrapper: ToastProvider });
    await screen.findByRole("button", { name: /revoke previous now/i });

    await user.click(screen.getByRole("button", { name: /revoke previous now/i }));

    expect(await screen.findByText("Previous key revoked")).toBeInTheDocument();
    expect(revokedPreviousId).toBe(PREVIOUS_KEY.id);
    expect(screen.queryByText(/rotation overlap window/i)).not.toBeInTheDocument();
  });

  // Revoking the CURRENT key stays behind a confirmation (confirmed prototype's "revokeKey"
  // modal) — the real, higher-stakes action.
  it("shows a revoke confirmation before revoking the current key, then returns to the empty state", async () => {
    let deleted = false;
    const fetchMock = vi.fn().mockImplementation((_path: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        deleted = true;
        return Promise.resolve(jsonResponse(200, { success: true, message: "Secret key revoked successfully" }));
      }
      return Promise.resolve(jsonResponse(200, { success: true, secret_keys: deleted ? [] : [CURRENT_KEY] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<SecretKeySection applicationId="app1" isRoot canManage />, { wrapper: ToastProvider });
    await screen.findAllByText("Service key");

    await user.click(screen.getByRole("button", { name: /^revoke$/i }));

    expect(await screen.findByText("Revoke service key?")).toBeInTheDocument();
    expect(deleted).toBe(false);

    await user.click(screen.getByRole("button", { name: /revoke key/i }));

    expect(await screen.findByText("No service key")).toBeInTheDocument();
    expect(deleted).toBe(true);
  });

  it("cancelling the revoke confirmation never calls the API", async () => {
    let deleted = false;
    const fetchMock = vi.fn().mockImplementation((_path: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        deleted = true;
        return Promise.resolve(jsonResponse(200, { success: true }));
      }
      return Promise.resolve(jsonResponse(200, { success: true, secret_keys: [CURRENT_KEY] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<SecretKeySection applicationId="app1" isRoot canManage />, { wrapper: ToastProvider });
    await screen.findAllByText("Service key");
    await user.click(screen.getByRole("button", { name: /^revoke$/i }));
    await screen.findByText("Revoke service key?");

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByText("Revoke service key?")).not.toBeInTheDocument();
    expect(deleted).toBe(false);
  });

  it("reports key presence via onKeyPresenceChange as false when there is no key and true when there is", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, secret_keys: [CURRENT_KEY] })));
    const onKeyPresenceChange = vi.fn();

    render(<SecretKeySection applicationId="app1" isRoot canManage onKeyPresenceChange={onKeyPresenceChange} />, { wrapper: ToastProvider });
    await screen.findAllByText("Service key");

    expect(onKeyPresenceChange).toHaveBeenCalledWith(true);
  });

  it("reports key presence as false when the key list is empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, secret_keys: [] })));
    const onKeyPresenceChange = vi.fn();

    render(<SecretKeySection applicationId="app1" isRoot canManage onKeyPresenceChange={onKeyPresenceChange} />, { wrapper: ToastProvider });
    await screen.findByText("No service key");

    expect(onKeyPresenceChange).toHaveBeenCalledWith(false);
  });

  it("calls onPendingApproval and opens the reveal modal (pending-approval copy) when the first-generate is intercepted with a plain_key", async () => {
    const fetchMock = vi.fn().mockImplementation((_path: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(
          jsonResponse(202, { approval_required: true, action_type: "secret_key_create", plain_key: "sk_pending123" })
        );
      }
      return Promise.resolve(jsonResponse(200, { success: true, secret_keys: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const onPendingApproval = vi.fn();
    const user = userEvent.setup();

    render(<SecretKeySection applicationId="app1" isRoot canManage onPendingApproval={onPendingApproval} />, { wrapper: ToastProvider });
    await screen.findByText("No service key");

    await user.click(screen.getByRole("button", { name: /generate service key/i }));

    expect(onPendingApproval).toHaveBeenCalledWith("secret_key_create");
    expect(await screen.findByText("sk_pending123")).toBeInTheDocument();
    expect(screen.getByText(/pending approval/i)).toBeInTheDocument();
  });

  it("calls onPendingApproval and does not open the reveal modal when the intercepted response carries no plain_key", async () => {
    const fetchMock = vi.fn().mockImplementation((_path: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(jsonResponse(202, { approval_required: true, action_type: "secret_key_create" }));
      }
      return Promise.resolve(jsonResponse(200, { success: true, secret_keys: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const onPendingApproval = vi.fn();
    const user = userEvent.setup();

    render(<SecretKeySection applicationId="app1" isRoot canManage onPendingApproval={onPendingApproval} />, { wrapper: ToastProvider });
    await screen.findByText("No service key");

    await user.click(screen.getByRole("button", { name: /generate service key/i }));

    expect(onPendingApproval).toHaveBeenCalledWith("secret_key_create");
    expect(screen.queryByText(/sk_/i)).not.toBeInTheDocument();
  });

  it("calls onPendingApproval and keeps the key visible when revoking the current key is intercepted (202)", async () => {
    const fetchMock = vi.fn().mockImplementation((_path: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        return Promise.resolve(jsonResponse(202, { approval_required: true, action_type: "secret_key_delete" }));
      }
      return Promise.resolve(jsonResponse(200, { success: true, secret_keys: [CURRENT_KEY] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const onPendingApproval = vi.fn();
    const user = userEvent.setup();

    render(<SecretKeySection applicationId="app1" isRoot canManage onPendingApproval={onPendingApproval} />, { wrapper: ToastProvider });
    await screen.findAllByText("Service key");

    await user.click(screen.getByRole("button", { name: /^revoke$/i }));
    await user.click(screen.getByRole("button", { name: /revoke key/i }));

    expect(onPendingApproval).toHaveBeenCalledWith("secret_key_delete");
    expect(screen.getAllByText("Service key").length).toBeGreaterThan(0);
  });

  it("shows the approval intercept before generating the first key, for a non-root caller, naming the application as the target", async () => {
    let generated = false;
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/approval/required?action_type=secret_key_create") return Promise.resolve(jsonResponse(200, { data: { required: true } }));
      if (init?.method === "POST") {
        generated = true;
        return Promise.resolve(jsonResponse(200, { success: true, secret_key: CURRENT_KEY, plain_key: "sk_abc123" }));
      }
      return Promise.resolve(jsonResponse(200, { success: true, secret_keys: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<SecretKeySection applicationId="app1" applicationName="Checkout Web" isRoot={false} canManage />, { wrapper: ToastProvider });
    await screen.findByText("No service key");

    await user.click(screen.getByRole("button", { name: /generate service key/i }));

    expect(await screen.findByText(/approval required/i)).toBeInTheDocument();
    expect(screen.getByText("Checkout Web", { selector: ".aic-val" })).toBeInTheDocument();
    expect(generated).toBe(false);

    await user.click(screen.getByRole("button", { name: /send for approval/i }));

    await vi.waitFor(() => expect(generated).toBe(true));
    expect(await screen.findByText("sk_abc123")).toBeInTheDocument();
  });

  it("shows the approval intercept before revoking the current key, for a non-root caller", async () => {
    let deleted = false;
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/approval/required?action_type=secret_key_delete") return Promise.resolve(jsonResponse(200, { data: { required: true } }));
      if (init?.method === "DELETE") {
        deleted = true;
        return Promise.resolve(jsonResponse(200, { success: true, message: "ok" }));
      }
      return Promise.resolve(jsonResponse(200, { success: true, secret_keys: deleted ? [] : [CURRENT_KEY] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<SecretKeySection applicationId="app1" isRoot={false} canManage />, { wrapper: ToastProvider });
    await screen.findAllByText("Service key");

    await user.click(screen.getByRole("button", { name: /^revoke$/i }));
    await user.click(screen.getByRole("button", { name: /revoke key/i }));

    expect(await screen.findByText(/approval required/i)).toBeInTheDocument();
    expect(deleted).toBe(false);

    await user.click(screen.getByRole("button", { name: /send for approval/i }));

    await vi.waitFor(() => expect(deleted).toBe(true));
  });
});
