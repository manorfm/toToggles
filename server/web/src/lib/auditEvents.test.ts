import { describe, expect, it } from "vitest";
import { auditEventMeta, formatAuditWhen } from "./auditEvents";

describe("auditEventMeta", () => {
  it("returns the confirmed icon/dot for a known event type", () => {
    expect(auditEventMeta("toggle_deleted")).toEqual({ icon: "trash", dot: "del" });
    expect(auditEventMeta("toggle_enabled")).toEqual({ icon: "check", dot: "on" });
    expect(auditEventMeta("key_generated")).toEqual({ icon: "key", dot: "" });
  });

  it("uses the same 'key' icon for revoke as for generate — the prototype never switches to trash for this event", () => {
    expect(auditEventMeta("key_revoked")).toEqual({ icon: "key", dot: "" });
  });

  it("gives approval_rejected and approval_system_toggled the same check/on treatment as approval_approved — the prototype's resolveApproval/updateApprovalSystem both log under the single 'approval' type", () => {
    expect(auditEventMeta("approval_approved")).toEqual({ icon: "check", dot: "on" });
    expect(auditEventMeta("approval_rejected")).toEqual({ icon: "check", dot: "on" });
    expect(auditEventMeta("approval_system_toggled")).toEqual({ icon: "check", dot: "on" });
  });

  it("uses the confirmed clock/off treatment for a submitted-for-approval event", () => {
    expect(auditEventMeta("approval_requested")).toEqual({ icon: "clock", dot: "off" });
  });

  it("falls back to a neutral history icon for an unrecognized event type", () => {
    expect(auditEventMeta("something_new")).toEqual({ icon: "history", dot: "" });
  });
});

describe("formatAuditWhen", () => {
  const now = new Date("2026-08-30T12:00:00Z");

  it("shows 'just now' for under a minute", () => {
    expect(formatAuditWhen("2026-08-30T11:59:30Z", now)).toBe("just now");
  });

  it("shows minutes for under an hour", () => {
    expect(formatAuditWhen("2026-08-30T11:48:00Z", now)).toBe("12 min ago");
  });

  it("shows hours (singular) for under a day", () => {
    expect(formatAuditWhen("2026-08-30T11:00:00Z", now)).toBe("1 hour ago");
    expect(formatAuditWhen("2026-08-30T09:00:00Z", now)).toBe("3 hours ago");
  });

  it("shows 'Yesterday' for exactly one day ago", () => {
    expect(formatAuditWhen("2026-08-29T12:00:00Z", now)).toBe("Yesterday");
  });

  it("shows days for under a week", () => {
    expect(formatAuditWhen("2026-08-27T12:00:00Z", now)).toBe("3 days ago");
  });

  it("falls back to a locale date beyond a week", () => {
    const result = formatAuditWhen("2026-08-01T12:00:00Z", now);
    expect(result).toBe(new Date("2026-08-01T12:00:00Z").toLocaleDateString());
  });
});
