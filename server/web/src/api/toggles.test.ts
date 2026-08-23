import { afterEach, describe, expect, it, vi } from "vitest";
import { createToggle, getToggleHierarchy, setToggleEnabled } from "./toggles";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("getToggleHierarchy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the hierarchy endpoint and returns the nested tree", async () => {
    const toggles = [{ id: "1", value: "user", enabled: true, toggles: [{ id: "2", value: "payments", enabled: false }] }];
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { application: "app1", toggles }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getToggleHierarchy("app1");

    expect(fetchMock).toHaveBeenCalledWith("/applications/app1/toggles?hierarchy=true", expect.anything());
    expect(result).toEqual(toggles);
  });

  it("returns an empty array when 'toggles' is omitted (no toggles yet)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { application: "app1" })));

    await expect(getToggleHierarchy("app1")).resolves.toEqual([]);
  });
});

describe("createToggle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the dotted path and returns the created result", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(201, { message: "toggle created successfully", path: "payments.card", enabled: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createToggle("app1", "payments.card");

    expect(fetchMock).toHaveBeenCalledWith(
      "/applications/app1/toggles",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ toggle: "payments.card" }) })
    );
    expect(result).toEqual({ kind: "created", path: "payments.card", enabled: true });
  });

  it("returns pending_approval on 202", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(202, { approval_required: true, action_type: "toggle_create" }))
    );

    await expect(createToggle("app1", "payments.card")).resolves.toEqual({
      kind: "pending_approval",
      actionType: "toggle_create",
    });
  });

  it("propagates ApiError when the path already exists", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(400, { code: "T0003", message: "toggle already exists" })));

    await expect(createToggle("app1", "payments.card")).rejects.toMatchObject({ status: 400 });
  });
});

describe("setToggleEnabled", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PUTs to the recursive (singular) toggle endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: "1", value: "payments", enabled: false }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await setToggleEnabled("app1", "tgl1", false);

    expect(fetchMock).toHaveBeenCalledWith(
      "/applications/app1/toggle/tgl1",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ enabled: false }) })
    );
    expect(result).toEqual({ kind: "updated" });
  });

  it("returns pending_approval on 202", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(202, { approval_required: true, action_type: "toggle_update" }))
    );

    await expect(setToggleEnabled("app1", "tgl1", false)).resolves.toEqual({
      kind: "pending_approval",
      actionType: "toggle_update",
    });
  });
});
