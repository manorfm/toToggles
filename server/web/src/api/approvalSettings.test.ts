import { afterEach, describe, expect, it, vi } from "vitest";
import { checkApprovalRequired, getApprovalSettings, updateApprovalSettings } from "./approvalSettings";
import type { ApprovalConfig } from "../types/approvalSettings";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const requiredActions: ApprovalConfig = {
  toggle_create: false,
  toggle_update: false,
  toggle_delete: true,
  toggle_enable: false,
  toggle_disable: false,
  toggle_rule: true,
  application_create: true,
  application_delete: true,
  secret_key_create: true,
  secret_key_delete: true,
};

const settings = {
  id: "01SET00000000000000000001",
  approval_enabled: false,
  required_actions: requiredActions,
  default_expiration_days: 7,
  created_at: "2026-08-19T10:00:00Z",
  updated_at: "2026-08-19T10:00:00Z",
};

describe("getApprovalSettings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches GET /approval/settings and unwraps the data envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { message: "approval settings retrieved successfully", data: settings }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getApprovalSettings();

    expect(fetchMock).toHaveBeenCalledWith("/api/approval/settings", expect.anything());
    expect(result).toEqual(settings);
  });

  it("propagates ApiError when the caller isn't root", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(403, { code: "T0004", message: "Forbidden" })));

    await expect(getApprovalSettings()).rejects.toMatchObject({ status: 403 });
  });
});

describe("updateApprovalSettings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PUTs only the provided fields and returns the updated settings", async () => {
    const updated = { ...settings, approval_enabled: true };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { message: "approval settings updated successfully", data: updated }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateApprovalSettings({ approvalEnabled: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/approval/settings",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ approval_enabled: true }) })
    );
    expect(result).toEqual(updated);
  });

  it("sends the whole required_actions object when patching a single action flag", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { message: "approval settings updated successfully", data: settings }));
    vi.stubGlobal("fetch", fetchMock);

    await updateApprovalSettings({ requiredActions: requiredActions });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/approval/settings",
      expect.objectContaining({ body: JSON.stringify({ required_actions: requiredActions }) })
    );
  });

  it("sends default_expiration_days when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { message: "approval settings updated successfully", data: settings }));
    vi.stubGlobal("fetch", fetchMock);

    await updateApprovalSettings({ defaultExpirationDays: 14 });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/approval/settings",
      expect.objectContaining({ body: JSON.stringify({ default_expiration_days: 14 }) })
    );
  });
});

// GET /approval/required — não-root-gated (diferente de GET /approval/settings), único
// jeito de qualquer role checar se UMA ação específica exige aprovação antes de tentá-la.
// Usado pelo intercept pré-envio (hooks/useApprovalIntercept.ts).
describe("checkApprovalRequired", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches GET /approval/required?action_type=X and unwraps data.required", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { message: "approval requirement checked", data: { action_type: "toggle_delete", required: true } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkApprovalRequired("toggle_delete");

    expect(fetchMock).toHaveBeenCalledWith("/api/approval/required?action_type=toggle_delete", expect.anything());
    expect(result).toBe(true);
  });

  it("returns false when the action isn't required", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, { message: "approval requirement checked", data: { action_type: "toggle_create", required: false } }))
    );

    await expect(checkApprovalRequired("toggle_create")).resolves.toBe(false);
  });
});
