import { afterEach, describe, expect, it, vi } from "vitest";
import { approveAndExecuteApproval, executeApproval, listApprovableApprovals, listPendingApprovals, rejectApproval } from "./approvals";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const request = {
  id: "1",
  action_type: "toggle_delete",
  description: "",
  requested_by: "u1",
  team_id: "t1",
  status: "pending",
  expires_at: "",
  created_at: "",
  updated_at: "",
  requester_name: "alice",
  team_name: "Payments Squad",
};

describe("listPendingApprovals", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("unwraps GET /approval/requests/pending's {message,data} envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { message: "ok", data: [request] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listPendingApprovals();

    expect(fetchMock).toHaveBeenCalledWith("/approval/requests/pending", expect.anything());
    expect(result).toEqual([request]);
  });

  it("returns an empty array when 'data' is omitted", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { message: "ok" })));

    await expect(listPendingApprovals()).resolves.toEqual([]);
  });
});

describe("listApprovableApprovals", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches GET /approval/requests/approvable", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { message: "ok", data: [request] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listApprovableApprovals();

    expect(fetchMock).toHaveBeenCalledWith("/approval/requests/approvable", expect.anything());
    expect(result).toEqual([request]);
  });
});

describe("approveAndExecuteApproval", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls approve then execute, in order", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      calls.push(path);
      return Promise.resolve(jsonResponse(200, { message: "ok" }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await approveAndExecuteApproval("1");

    expect(calls).toEqual(["/approval/requests/1/approve", "/approval/requests/1/execute"]);
  });

  it("propagates ApiError from approve without calling execute", async () => {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path.endsWith("/approve")) return Promise.resolve(jsonResponse(403, { code: "T0001", message: "not an approver" }));
      return Promise.resolve(jsonResponse(200, { message: "ok" }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(approveAndExecuteApproval("1")).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("executeApproval", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to /approval/requests/:id/execute", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { message: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    await executeApproval("1");

    expect(fetchMock).toHaveBeenCalledWith("/approval/requests/1/execute", expect.objectContaining({ method: "POST" }));
  });
});

describe("rejectApproval", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the optional reason to /approval/requests/:id/reject", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { message: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    await rejectApproval("1", "Toggle still in use");

    expect(fetchMock).toHaveBeenCalledWith(
      "/approval/requests/1/reject",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ reason: "Toggle still in use" }) })
    );
  });
});
