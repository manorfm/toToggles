import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditFeed } from "./AuditFeed";
import type { AuditLogEntry, AuditLogPage } from "../types/audit";

function entry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: "au1",
    event_type: "toggle_deleted",
    category: "toggles",
    text: "Deleted toggle payments.card",
    target: "",
    team_id: "team-1",
    application_id: null,
    before: null,
    after: null,
    actor_id: "u1",
    actor_name: "alice",
    created_at: "2026-08-30T10:00:00Z",
    ...overrides,
  };
}

function page(data: AuditLogEntry[], nextCursor = ""): AuditLogPage {
  return { data, next_cursor: nextCursor };
}

// jsdom não implementa IntersectionObserver — um fake que guarda o callback registrado deixa o
// teste simular "o sentinel entrou na viewport" chamando esse callback manualmente.
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }
  trigger(isIntersecting: boolean) {
    this.callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

// v2.6 §7: AuditFeed extrai a paginação infinita por cursor (antes só existia dentro de
// HistoryScreen) pra ser reusada pela Activity tab de uma aplicação (ApplicationDetailScreen) —
// mesma UI, fonte de dados diferente (fetchPage é o único ponto de acoplamento).
describe("AuditFeed", () => {
  beforeEach(() => {
    FakeIntersectionObserver.instances = [];
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows an empty state when there are no entries", async () => {
    render(<AuditFeed fetchPage={() => Promise.resolve(page([]))} emptyDescription="No events yet." />);

    expect(await screen.findByText("Nothing here yet")).toBeInTheDocument();
    expect(screen.getByText("No events yet.")).toBeInTheDocument();
  });

  it("lists entries in the order given", async () => {
    render(
      <AuditFeed
        fetchPage={() => Promise.resolve(page([entry({ id: "2", text: "Created toggle x" }), entry({ id: "1", text: "Deleted toggle y" })]))}
        emptyDescription="No events yet."
      />
    );

    const texts = await screen.findAllByText(/Created toggle|Deleted toggle/);
    expect(texts[0]).toHaveTextContent("Created toggle x");
    expect(texts[1]).toHaveTextContent("Deleted toggle y");
  });

  it("shows an error message when the fetch fails", async () => {
    render(<AuditFeed fetchPage={() => Promise.reject(new Error("boom"))} emptyDescription="No events yet." />);

    expect(await screen.findByText(/não foi possível carregar/i)).toBeInTheDocument();
  });

  it("loads the next page and appends it when the sentinel intersects", async () => {
    const fetchPage = vi.fn().mockImplementation((cursor?: string) => {
      if (cursor) return Promise.resolve(page([entry({ id: "older", text: "Older event" })]));
      return Promise.resolve(page([entry({ id: "newer", text: "Newer event" })], "opaque-cursor"));
    });

    render(<AuditFeed fetchPage={fetchPage} emptyDescription="No events yet." />);
    await screen.findByText("Newer event");

    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    FakeIntersectionObserver.instances[0].trigger(true);

    await screen.findByText("Older event");
    expect(screen.getByText("Newer event")).toBeInTheDocument();
    expect(fetchPage).toHaveBeenLastCalledWith("opaque-cursor");
  });

  it("does not render a sentinel once there is no next page", async () => {
    render(<AuditFeed fetchPage={() => Promise.resolve(page([entry()]))} emptyDescription="No events yet." />);

    await screen.findByText("Deleted toggle payments.card");

    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });

  it("refetches from scratch when fetchPage's identity changes", async () => {
    const { rerender } = render(
      <AuditFeed fetchPage={() => Promise.resolve(page([entry({ id: "1", text: "First filter" })]))} emptyDescription="No events yet." />
    );
    await screen.findByText("First filter");

    rerender(<AuditFeed fetchPage={() => Promise.resolve(page([entry({ id: "2", text: "Second filter" })]))} emptyDescription="No events yet." />);

    await screen.findByText("Second filter");
    expect(screen.queryByText("First filter")).not.toBeInTheDocument();
  });

  it("reports loaded entries via onEntriesChange, for actions like CSV export owned by the parent", async () => {
    const onEntriesChange = vi.fn();

    render(<AuditFeed fetchPage={() => Promise.resolve(page([entry({ id: "1" })]))} emptyDescription="No events yet." onEntriesChange={onEntriesChange} />);

    await screen.findByText("Deleted toggle payments.card");
    expect(onEntriesChange).toHaveBeenLastCalledWith([expect.objectContaining({ id: "1" })]);
  });
});
