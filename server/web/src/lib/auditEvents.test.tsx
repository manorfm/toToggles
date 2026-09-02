import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { auditEventMeta, formatAuditWhen, renderAuditText } from "./auditEvents";

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

// Confirmado no protótipo real (app.jsx#logAudit e AUDIT_SEED literal): o termo-chave de cada
// linha vem em negrito, ex. "Disabled <b>experiments</b> branch". O backend emite esse mesmo
// marcador `<b>...</b>` no texto (nunca outra tag); este parser NUNCA usa
// dangerouslySetInnerHTML — monta elementos React reais a partir só desse marcador reconhecido,
// então qualquer outro caractere (inclusive de um nome de time/toggle/usuário controlado por um
// atacante) vira texto puro, nunca é interpretado como markup.
describe("renderAuditText", () => {
  it("renders a <b>...</b> marker as a real bold element", () => {
    render(<div>{renderAuditText("Disabled <b>experiments</b> branch")}</div>);
    const bold = screen.getByText("experiments");
    expect(bold.tagName).toBe("B");
  });

  it("renders plain text with no markers unchanged", () => {
    render(<div>{renderAuditText("Generated service key")}</div>);
    expect(screen.getByText("Generated service key")).toBeInTheDocument();
  });

  it("supports more than one bold span in the same line", () => {
    render(<div>{renderAuditText("Set <b>percentage</b> rule to <b>40%</b>")}</div>);
    expect(screen.getByText("percentage").tagName).toBe("B");
    expect(screen.getByText("40%").tagName).toBe("B");
  });

  // Segurança: um valor controlado pelo usuário (nome de time, path de toggle...) nunca deve
  // executar como HTML — só o literal "<b>...</b>" é reconhecido; qualquer outra tag vira texto
  // puro e inerte, exatamente como React trata texto por padrão (sem dangerouslySetInnerHTML em
  // lugar nenhum deste parser).
  it("never executes markup from a malicious value — anything other than <b>...</b> renders as inert text", () => {
    const { container } = render(<div>{renderAuditText('Created team <img src=x onerror="window.__pwned=true">')}</div>);
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(container.textContent).toContain('<img src=x onerror="window.__pwned=true">');
  });

  it("does not break when a malicious value contains a literal <b> marker — worst case is cosmetic bolding, not code execution", () => {
    render(<div>{renderAuditText("Created team <b>x</script><script>alert(1)</script></b>")}</div>);
    expect(document.querySelector("script")).not.toBeInTheDocument();
  });
});
