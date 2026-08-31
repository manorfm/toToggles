import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuditRow } from "./AuditRow";
import type { AuditLogEntry } from "../types/audit";

const entry: AuditLogEntry = {
  id: "au1",
  event_type: "toggle_deleted",
  category: "toggles",
  text: "Deleted toggle payments.card",
  target: "Checkout Service",
  team_id: "team-1",
  actor_id: "u1",
  actor_name: "alice",
  created_at: new Date(Date.now() - 5 * 60000).toISOString(),
};

describe("AuditRow", () => {
  it("shows the event text, target, actor initials/name and a relative time", () => {
    render(<AuditRow entry={entry} isLast={false} />);

    expect(screen.getByText("Deleted toggle payments.card")).toBeInTheDocument();
    expect(screen.getByText("Checkout Service")).toBeInTheDocument();
    expect(screen.getByText("AL")).toBeInTheDocument();
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("5 min ago")).toBeInTheDocument();
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
});
