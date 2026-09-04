import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SecretKeySection } from "./SecretKeySection";
import { ToastProvider } from "./ToastProvider";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const EXISTING_KEY = { id: "1", name: "API Access Key", application_id: "app1", created_by: "u1", created_at: "2026-01-15T10:00:00Z", updated_at: "2026-01-15T10:00:00Z" };

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

  it("shows the existing key's created date and Rotate/Revoke actions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, secret_keys: [EXISTING_KEY] })));

    const { container } = render(<SecretKeySection applicationId="app1" isRoot canManage />, { wrapper: ToastProvider });

    // "Service key" aparece 2x de propósito (título da seção + nome estático da chave,
    // confirmado no protótipo real — get_screen_full("KeysView")) — checa o `.ks-name`
    // especificamente pra não depender da ordem em que os dois aparecem.
    await screen.findByText(/created/i);
    expect(container.querySelector(".ks-name")).toHaveTextContent("Service key");
    expect(screen.getByText(/created/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /rotate key/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /revoke/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate new key/i })).toBeInTheDocument();
  });

  it("hides the 'lost the key' card and rotate/revoke actions when canManage is false", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, secret_keys: [EXISTING_KEY] })));

    render(<SecretKeySection applicationId="app1" isRoot canManage={false} />, { wrapper: ToastProvider });

    await screen.findAllByText("Service key");
    expect(screen.queryByRole("button", { name: /rotate key/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /revoke/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Lost the key?")).not.toBeInTheDocument();
  });

  it("generates a key and opens the reveal-once modal", async () => {
    const fetchMock = vi.fn().mockImplementation((_path: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(
          jsonResponse(200, {
            success: true,
            secret_key: EXISTING_KEY,
            plain_key: "sk_abc123",
            warning: "shown once",
          })
        );
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

  it("revokes the key and returns to the empty state", async () => {
    let deleted = false;
    const fetchMock = vi.fn().mockImplementation((_path: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        deleted = true;
        return Promise.resolve(jsonResponse(200, { success: true, message: "Secret key deleted successfully" }));
      }
      return Promise.resolve(
        jsonResponse(200, { success: true, secret_keys: deleted ? [] : [EXISTING_KEY] })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<SecretKeySection applicationId="app1" isRoot canManage />, { wrapper: ToastProvider });
    await screen.findAllByText("Service key");

    await user.click(screen.getByRole("button", { name: /revoke/i }));

    expect(await screen.findByText("No service key")).toBeInTheDocument();
  });

  it("reports key presence via onKeyPresenceChange as false when there is no key and true when there is", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, secret_keys: [EXISTING_KEY] })));
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

  it("calls onPendingApproval and opens the reveal modal (pending-approval copy) when generate is intercepted with a plain_key", async () => {
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

  it("calls onPendingApproval and keeps the key visible when delete is intercepted (202)", async () => {
    const fetchMock = vi.fn().mockImplementation((_path: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        return Promise.resolve(jsonResponse(202, { approval_required: true, action_type: "secret_key_delete" }));
      }
      return Promise.resolve(jsonResponse(200, { success: true, secret_keys: [EXISTING_KEY] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const onPendingApproval = vi.fn();
    const user = userEvent.setup();

    render(<SecretKeySection applicationId="app1" isRoot canManage onPendingApproval={onPendingApproval} />, { wrapper: ToastProvider });
    await screen.findAllByText("Service key");

    await user.click(screen.getByRole("button", { name: /revoke/i }));

    expect(onPendingApproval).toHaveBeenCalledWith("secret_key_delete");
    expect(screen.getAllByText("Service key").length).toBeGreaterThan(0);
  });

  it("shows the approval intercept before generating, for a non-root caller, naming the application as the target", async () => {
    let generated = false;
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/approval/required?action_type=secret_key_create") return Promise.resolve(jsonResponse(200, { data: { required: true } }));
      if (init?.method === "POST") {
        generated = true;
        return Promise.resolve(jsonResponse(200, { success: true, secret_key: EXISTING_KEY, plain_key: "sk_abc123" }));
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

  it("shows the approval intercept before revoking, for a non-root caller", async () => {
    let deleted = false;
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/api/approval/required?action_type=secret_key_delete") return Promise.resolve(jsonResponse(200, { data: { required: true } }));
      if (init?.method === "DELETE") {
        deleted = true;
        return Promise.resolve(jsonResponse(200, { success: true, message: "ok" }));
      }
      return Promise.resolve(jsonResponse(200, { success: true, secret_keys: deleted ? [] : [EXISTING_KEY] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<SecretKeySection applicationId="app1" isRoot={false} canManage />, { wrapper: ToastProvider });
    await screen.findAllByText("Service key");

    await user.click(screen.getByRole("button", { name: /revoke/i }));

    expect(await screen.findByText(/approval required/i)).toBeInTheDocument();
    expect(deleted).toBe(false);

    await user.click(screen.getByRole("button", { name: /send for approval/i }));

    await vi.waitFor(() => expect(deleted).toBe(true));
  });
});
