import { describe, expect, it } from "vitest";
import { parseToggle } from "./toggle.js";

// Matches the real public GET /api/toggles response shape (server/internal/app/handler/
// secret_key_handler.go): activation_rule is JSON null whenever has_activation_rule is false —
// this is the exact bug found and fixed in totoggle_java's model/Toggle.kt this session, and
// deliberately built correctly from the start in both totoggle_go and here.
describe("parseToggle", () => {
  it("parses a toggle with no activation rule and no parent", () => {
    const toggle = parseToggle({
      id: "toggle-1",
      path: "user",
      value: "user",
      enabled: true,
      level: 0,
      parent_id: null,
      app_id: "app-123",
      has_activation_rule: false,
      activation_rule: null,
    });

    expect(toggle.id).toBe("toggle-1");
    expect(toggle.path.toString()).toBe("user");
    expect(toggle.enabled).toBe(true);
    expect(toggle.parentId).toBeNull();
    expect(toggle.hasActivationRule).toBe(false);
    expect(toggle.activationRule).toBeNull();
  });

  it("parses a toggle with a rule and a parent", () => {
    const toggle = parseToggle({
      id: "toggle-3",
      path: "user.payments.view-table",
      value: "view-table",
      enabled: true,
      level: 2,
      parent_id: "toggle-2",
      app_id: "app-123",
      has_activation_rule: true,
      activation_rule: { type: "percentage", value: "25" },
    });

    expect(toggle.path.toString()).toBe("user.payments.view-table");
    expect(toggle.parentId).toBe("toggle-2");
    expect(toggle.activationRule).toEqual({ type: "percentage", value: "25" });
  });

  it("rejects an invalid path", () => {
    expect(() =>
      parseToggle({
        id: "x",
        path: "",
        value: "x",
        enabled: true,
        level: 0,
        parent_id: null,
        app_id: "app-1",
        has_activation_rule: false,
        activation_rule: null,
      }),
    ).toThrow(/must not be empty/);
  });

  it.each([null, undefined, "not an object", 42, []])(
    "rejects a non-object payload (%s)",
    (payload) => {
      expect(() => parseToggle(payload)).toThrow();
    },
  );

  const validToggle = {
    id: "toggle-1",
    path: "user",
    value: "user",
    enabled: true,
    level: 0,
    parent_id: null,
    app_id: "app-123",
    has_activation_rule: false,
    activation_rule: null,
  };

  it.each([
    ["id", 42, /toggle\.id/],
    ["path", 42, /toggle\.path/],
    ["value", 42, /toggle\.value/],
    ["enabled", "yes", /toggle\.enabled/],
    ["level", "0", /toggle\.level/],
    ["parent_id", 42, /toggle\.parent_id/],
    ["app_id", 42, /toggle\.app_id/],
    ["has_activation_rule", "yes", /toggle\.has_activation_rule/],
    ["activation_rule", "not an object", /toggle\.activation_rule/],
  ] as const)("rejects a wrong-typed %s field", (field, badValue, expectedMessage) => {
    expect(() => parseToggle({ ...validToggle, [field]: badValue })).toThrow(expectedMessage);
  });

  it("accepts a string parent_id", () => {
    const toggle = parseToggle({ ...validToggle, parent_id: "parent-1" });
    expect(toggle.parentId).toBe("parent-1");
  });
});
