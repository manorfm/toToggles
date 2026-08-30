import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteSecretKey, generateSecretKey, listSecretKeys } from "./secretKeys";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("listSecretKeys", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("unwraps GET .../secret-keys's {success,secret_keys} envelope", async () => {
    const keys = [
      { id: "1", name: "API Access Key", application_id: "app1", created_by: "u1", created_at: "", updated_at: "" },
    ];
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, secret_keys: keys }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listSecretKeys("app1");

    expect(fetchMock).toHaveBeenCalledWith("/api/applications/app1/secret-keys", expect.anything());
    expect(result).toEqual(keys);
  });

  it("returns an empty array when 'secret_keys' is omitted", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { success: true })));

    await expect(listSecretKeys("app1")).resolves.toEqual([]);
  });

  it("propagates ApiError for non-admin callers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(403, { error: "Forbidden" })));

    await expect(listSecretKeys("app1")).rejects.toMatchObject({ status: 403 });
  });
});

describe("generateSecretKey", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to generate-secret and returns the plain key (shown once)", async () => {
    const secretKey = { id: "1", name: "API Access Key", application_id: "app1", created_by: "u1", created_at: "", updated_at: "" };
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { success: true, secret_key: secretKey, plain_key: "sk_abc123", warning: "shown once" })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateSecretKey("app1");

    expect(fetchMock).toHaveBeenCalledWith("/api/applications/app1/generate-secret", expect.objectContaining({ method: "POST" }));
    expect(result).toEqual({ kind: "generated", secretKey, plainKey: "sk_abc123", warning: "shown once" });
  });

  it("returns pending_approval when the server intercepts the request (202)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(202, { approval_required: true, action_type: "secret_key_create" }))
    );

    const result = await generateSecretKey("app1");

    expect(result).toEqual({ kind: "pending_approval", actionType: "secret_key_create" });
  });
});

describe("deleteSecretKey", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends DELETE to /secret-keys/:id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, message: "Secret key deleted successfully" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await deleteSecretKey("1");

    expect(fetchMock).toHaveBeenCalledWith("/api/secret-keys/1", expect.objectContaining({ method: "DELETE" }));
    expect(result).toEqual({ kind: "deleted" });
  });

  it("returns pending_approval when the server intercepts the request (202)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(202, { approval_required: true, action_type: "secret_key_delete" }))
    );

    const result = await deleteSecretKey("1");

    expect(result).toEqual({ kind: "pending_approval", actionType: "secret_key_delete" });
  });
});
