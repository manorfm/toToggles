import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuditRow } from "./AuditRow";
import type { AuditLogEntry } from "../types/audit";

const entry: AuditLogEntry = {
  id: "au1",
  event_type: "toggle_deleted",
  category: "toggles",
  text: "Deleted toggle <b>payments.card</b>",
  target: "Checkout Service",
  team_id: "team-1",
  application_id: null,
  before: null,
  after: null,
  actor_id: "u1",
  actor_name: "Alice Ribeiro",
  created_at: new Date(Date.now() - 5 * 60000).toISOString(),
};

describe("AuditRow", () => {
  it("shows the event text, target, actor full name and a relative time", () => {
    render(<AuditRow entry={entry} isLast={false} />);

    expect(screen.getByText((_, node) => node?.textContent === "Deleted toggle payments.card")).toBeInTheDocument();
    expect(screen.getByText("Checkout Service")).toBeInTheDocument();
    expect(screen.getByText("Alice Ribeiro")).toBeInTheDocument();
    expect(screen.getByText("5 min ago")).toBeInTheDocument();
  });

  // Confirmado no protótipo real (app.jsx#logAudit/AUDIT_SEED): o termo-chave vem em negrito —
  // renderAuditText (lib/auditEvents.tsx) monta um <b> React de verdade a partir do marcador
  // `<b>...</b>` no texto, nunca via dangerouslySetInnerHTML (ver os testes de segurança em
  // auditEvents.test.tsx).
  it("renders the <b>...</b> marker in entry.text as a real bold element", () => {
    render(<AuditRow entry={entry} isLast={false} />);

    expect(screen.getByText("payments.card").tagName).toBe("B");
  });

  // initials vêm do NOME completo do ator via o mesmo algoritmo do protótipo real
  // (lib/userDisplay.ts#initialsOf — primeira letra dos 2 primeiros nomes), não uma fatia crua
  // do texto: "Alice Ribeiro" -> "AR", não "AL".
  it("derives the avatar initials from the actor's full name (first letter of each of the first two words)", () => {
    render(<AuditRow entry={entry} isLast={false} />);

    expect(screen.getByText("AR")).toBeInTheDocument();
  });

  it("omits the target line when there is none", () => {
    render(<AuditRow entry={{ ...entry, target: "" }} isLast={false} />);
    expect(screen.queryByText("Checkout Service")).not.toBeInTheDocument();
  });

  it("applies the dot tone class matching the event type", () => {
    const { container } = render(<AuditRow entry={entry} isLast={false} />);
    expect(container.querySelector(".audit-dot")).toHaveClass("del");
  });

  it("renders the connecting line unless it is the last item", () => {
    const { container, rerender } = render(<AuditRow entry={entry} isLast={false} />);
    expect(container.querySelector(".audit-line")).toBeInTheDocument();

    rerender(<AuditRow entry={entry} isLast />);
    expect(container.querySelector(".audit-line")).not.toBeInTheDocument();
  });

  // v2.6 §7: "{before} → {after}" abaixo do texto, só quando presentes (AuditFeed real,
  // confirmado via design-graph: `e.meta && (e.meta.before !== undefined) && (...)`).
  it("shows a before → after line when both are present", () => {
    render(<AuditRow entry={{ ...entry, before: "No rule", after: "percentage: 25%" }} isLast={false} />);

    expect(screen.getByText((_, node) => node?.textContent === "No rule → percentage: 25%")).toBeInTheDocument();
  });

  it("omits the before/after line when they are absent", () => {
    render(<AuditRow entry={entry} isLast={false} />);

    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
  });
});
