import { afterEach, describe, expect, it, vi } from "vitest";
import { createToggle, deleteToggle, getToggle, getToggleHierarchy, getTogglesFlat, setToggleEnabled, updateToggleRule } from "./toggles";

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

    expect(fetchMock).toHaveBeenCalledWith("/api/applications/app1/toggles?hierarchy=true", expect.anything());
    expect(result).toEqual(toggles);
  });

  it("returns an empty array when 'toggles' is omitted (no toggles yet)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { application: "app1" })));

    await expect(getToggleHierarchy("app1")).resolves.toEqual([]);
  });
});

describe("getTogglesFlat", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the flat endpoint (no hierarchy param) and returns the bare array of toggle details", async () => {
    const toggles = [
      {
        id: "1",
        value: "card",
        enabled: true,
        path: "payments.card",
        level: 1,
        parent_id: "0",
        app_id: "app1",
        has_activation_rule: false,
        activation_rule: null,
      },
    ];
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, toggles));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getTogglesFlat("app1");

    expect(fetchMock).toHaveBeenCalledWith("/api/applications/app1/toggles", expect.anything());
    expect(result).toEqual(toggles);
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
      "/api/applications/app1/toggles",
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
      "/api/applications/app1/toggle/tgl1",
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

describe("deleteToggle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("DELETEs the non-recursive (plural) toggle endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { message: "toggle deleted successfully" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await deleteToggle("app1", "tgl1");

    expect(fetchMock).toHaveBeenCalledWith("/api/applications/app1/toggles/tgl1", expect.objectContaining({ method: "DELETE" }));
    expect(result).toEqual({ kind: "deleted" });
  });

  it("returns pending_approval on 202", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(202, { approval_required: true, action_type: "toggle_delete" }))
    );

    await expect(deleteToggle("app1", "tgl1")).resolves.toEqual({
      kind: "pending_approval",
      actionType: "toggle_delete",
    });
  });
});

describe("getToggle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches GET /applications/:id/toggles/:toggleId and returns the raw entity", async () => {
    const toggle = {
      id: "tgl1",
      value: "card",
      enabled: true,
      path: "payments.card",
      level: 1,
      parent_id: "1",
      app_id: "app1",
      has_activation_rule: false,
      activation_rule: null,
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, toggle));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getToggle("app1", "tgl1");

    expect(fetchMock).toHaveBeenCalledWith("/api/applications/app1/toggles/tgl1", expect.anything());
    expect(result).toEqual(toggle);
  });
});

describe("updateToggleRule", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PUTs enabled/has_activation_rule/activation_rule to the non-recursive (plural) endpoint", async () => {
    const updated = {
      id: "tgl1",
      value: "card",
      enabled: true,
      path: "payments.card",
      level: 1,
      parent_id: "1",
      app_id: "app1",
      has_activation_rule: true,
      activation_rule: { type: "percentage", value: "25" },
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, updated));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateToggleRule("app1", "tgl1", {
      enabled: true,
      hasActivationRule: true,
      activationRule: { type: "percentage", value: "25" },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/applications/app1/toggles/tgl1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          enabled: true,
          has_activation_rule: true,
          activation_rule: { type: "percentage", value: "25" },
        }),
      })
    );
    expect(result).toEqual({ kind: "updated", toggle: updated });
  });

  it("omits activation_rule from the body when hasActivationRule is false", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        id: "tgl1",
        value: "card",
        enabled: true,
        path: "payments.card",
        level: 1,
        parent_id: "1",
        app_id: "app1",
        has_activation_rule: false,
        activation_rule: null,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await updateToggleRule("app1", "tgl1", { enabled: true, hasActivationRule: false });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/applications/app1/toggles/tgl1",
      expect.objectContaining({ body: JSON.stringify({ enabled: true, has_activation_rule: false }) })
    );
  });

  it("returns pending_approval on 202", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(202, { approval_required: true, action_type: "toggle_rule" }))
    );

    await expect(updateToggleRule("app1", "tgl1", { enabled: true, hasActivationRule: false })).resolves.toEqual({
      kind: "pending_approval",
      actionType: "toggle_rule",
    });
  });
});
