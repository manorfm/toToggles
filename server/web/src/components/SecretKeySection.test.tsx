import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SecretKeySection } from "./SecretKeySection";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("SecretKeySection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows an empty state and a Generate button when there is no key yet (canManage)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, secret_keys: [] })));

    render(<SecretKeySection applicationId="app1" canManage />);

    expect(await screen.findByText(/nenhuma chave/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate key/i })).toBeInTheDocument();
  });

  it("hides management actions when canManage is false", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, secret_keys: [] })));

    render(<SecretKeySection applicationId="app1" canManage={false} />);

    await screen.findByText(/nenhuma chave/i);
    expect(screen.queryByRole("button", { name: /generate key/i })).not.toBeInTheDocument();
  });

  it("shows the existing key's name and a Regenerate/Delete pair", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          success: true,
          secret_keys: [{ id: "1", name: "API Access Key", application_id: "app1", created_by: "u1", created_at: "", updated_at: "" }],
        })
      )
    );

    render(<SecretKeySection applicationId="app1" canManage />);

    expect(await screen.findByText("API Access Key")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /regenerate/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });

  it("generates a key and opens the reveal-once modal", async () => {
    const fetchMock = vi.fn().mockImplementation((_path: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(
          jsonResponse(200, {
            success: true,
            secret_key: { id: "1", name: "API Access Key", application_id: "app1", created_by: "u1", created_at: "", updated_at: "" },
            plain_key: "sk_abc123",
            warning: "shown once",
          })
        );
      }
      return Promise.resolve(jsonResponse(200, { success: true, secret_keys: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<SecretKeySection applicationId="app1" canManage />);
    await screen.findByText(/nenhuma chave/i);

    await user.click(screen.getByRole("button", { name: /generate key/i }));

    expect(await screen.findByText("sk_abc123")).toBeInTheDocument();
  });

  it("deletes the key and returns to the empty state", async () => {
    let deleted = false;
    const fetchMock = vi.fn().mockImplementation((_path: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        deleted = true;
        return Promise.resolve(jsonResponse(200, { success: true, message: "Secret key deleted successfully" }));
      }
      return Promise.resolve(
        jsonResponse(200, {
          success: true,
          secret_keys: deleted ? [] : [{ id: "1", name: "API Access Key", application_id: "app1", created_by: "u1", created_at: "", updated_at: "" }],
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<SecretKeySection applicationId="app1" canManage />);
    await screen.findByText("API Access Key");

    await user.click(screen.getByRole("button", { name: /delete/i }));

    expect(await screen.findByText(/nenhuma chave/i)).toBeInTheDocument();
  });

  it("reports key presence via onKeyPresenceChange as false when there is no key and true when there is", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          success: true,
          secret_keys: [{ id: "1", name: "API Access Key", application_id: "app1", created_by: "u1", created_at: "", updated_at: "" }],
        })
      )
    );
    const onKeyPresenceChange = vi.fn();

    render(<SecretKeySection applicationId="app1" canManage onKeyPresenceChange={onKeyPresenceChange} />);
    await screen.findByText("API Access Key");

    expect(onKeyPresenceChange).toHaveBeenCalledWith(true);
  });

  it("reports key presence as false when the key list is empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true, secret_keys: [] })));
    const onKeyPresenceChange = vi.fn();

    render(<SecretKeySection applicationId="app1" canManage onKeyPresenceChange={onKeyPresenceChange} />);
    await screen.findByText(/nenhuma chave/i);

    expect(onKeyPresenceChange).toHaveBeenCalledWith(false);
  });
});
