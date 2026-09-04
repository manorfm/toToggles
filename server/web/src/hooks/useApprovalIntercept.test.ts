import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useApprovalIntercept } from "./useApprovalIntercept";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("useApprovalIntercept", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs the action directly, without opening an intercept, when the action doesn't require approval", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, { data: { action_type: "toggle_delete", required: false } }))
    );
    const run = vi.fn();
    const { result } = renderHook(() => useApprovalIntercept(false));

    await act(async () => {
      await result.current.guard("toggle_delete", { actionDesc: "Delete toggle", path: "a.b" }, run);
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(result.current.intercept).toBeNull();
  });

  it("opens the intercept instead of running the action when approval is required", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, { data: { action_type: "toggle_delete", required: true } }))
    );
    const run = vi.fn();
    const { result } = renderHook(() => useApprovalIntercept(false));

    await act(async () => {
      await result.current.guard("toggle_delete", { actionDesc: "Delete toggle", path: "a.b" }, run);
    });

    expect(run).not.toHaveBeenCalled();
    expect(result.current.intercept).toEqual({ actionDesc: "Delete toggle", path: "a.b", team: undefined });
  });

  it("always runs directly for root, never checking or opening an intercept", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: { action_type: "toggle_delete", required: true } }));
    vi.stubGlobal("fetch", fetchMock);
    const run = vi.fn();
    const { result } = renderHook(() => useApprovalIntercept(true));

    await act(async () => {
      await result.current.guard("toggle_delete", { actionDesc: "Delete toggle" }, run);
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(result.current.intercept).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails open (runs the action) if the required-check itself errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const run = vi.fn();
    const { result } = renderHook(() => useApprovalIntercept(false));

    await act(async () => {
      await result.current.guard("toggle_delete", { actionDesc: "Delete toggle" }, run);
    });

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("runs the pending action and clears the intercept on confirm", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { data: { action_type: "toggle_delete", required: true } })));
    const run = vi.fn();
    const { result } = renderHook(() => useApprovalIntercept(false));

    await act(async () => {
      await result.current.guard("toggle_delete", { actionDesc: "Delete toggle" }, run);
    });
    expect(result.current.intercept).not.toBeNull();

    await act(async () => {
      await result.current.confirm();
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(result.current.intercept).toBeNull();
  });

  it("cancel clears the intercept without ever running the action", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { data: { action_type: "toggle_delete", required: true } })));
    const run = vi.fn();
    const { result } = renderHook(() => useApprovalIntercept(false));

    await act(async () => {
      await result.current.guard("toggle_delete", { actionDesc: "Delete toggle" }, run);
    });

    act(() => {
      result.current.cancel();
    });

    expect(run).not.toHaveBeenCalled();
    expect(result.current.intercept).toBeNull();
  });

  it("sets busy while confirm's run is in flight, and clears it after", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { data: { action_type: "toggle_delete", required: true } })));
    let resolveRun!: () => void;
    const run = vi.fn().mockImplementation(() => new Promise<void>((resolve) => (resolveRun = resolve)));
    const { result } = renderHook(() => useApprovalIntercept(false));

    await act(async () => {
      await result.current.guard("toggle_delete", { actionDesc: "Delete toggle" }, run);
    });

    let confirmPromise!: Promise<void>;
    act(() => {
      confirmPromise = result.current.confirm();
    });
    await waitFor(() => expect(result.current.busy).toBe(true));

    await act(async () => {
      resolveRun();
      await confirmPromise;
    });
    expect(result.current.busy).toBe(false);
  });
});
