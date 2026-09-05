import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HistoryScreen } from "./HistoryScreen";
import { downloadCSV } from "../lib/csvExport";

vi.mock("../lib/csvExport", () => ({ downloadCSV: vi.fn() }));

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function entry(overrides: Partial<Record<string, unknown>> = {}) {
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

function fetchMockWithActors(page: unknown, actors: { id: string; name: string }[] = [{ id: "u1", name: "alice" }]) {
  return vi.fn().mockImplementation((url: string) => {
    if (url.includes("/audit/actors")) return Promise.resolve(jsonResponse(200, { data: actors }));
    return Promise.resolve(jsonResponse(200, page));
  });
}

// jsdom não implementa IntersectionObserver — um fake que guarda o callback registrado deixa o
// teste simular "o sentinel entrou na viewport" chamando esse callback manualmente, sem precisar
// de geometria de layout real (que jsdom também não tem).
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

describe("HistoryScreen", () => {
  beforeEach(() => {
    FakeIntersectionObserver.instances = [];
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows an empty state when there is no history yet", async () => {
    // mockImplementation (não mockResolvedValue) — HistoryScreen agora faz DUAS chamadas em
    // paralelo (audit log + lista de atores); mockResolvedValue reusa a MESMA instância de
    // Response pras duas, e Response.json() só pode ser lido uma vez (a segunda chamada quebraria
    // com "body stream already read").
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => jsonResponse(200, { data: [], next_cursor: "" })));

    render(<HistoryScreen />);

    expect(await screen.findByText("Nothing here yet")).toBeInTheDocument();
  });

  it("lists entries in the order the server returns them (newest first)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        jsonResponse(200, {
          data: [entry({ id: "2", text: "Created application Checkout Web" }), entry({ id: "1", text: "Deleted toggle payments.card" })],
          next_cursor: "",
        })
      )
    );

    render(<HistoryScreen />);

    const texts = await screen.findAllByText(/Created application|Deleted toggle/);
    expect(texts[0]).toHaveTextContent("Created application Checkout Web");
    expect(texts[1]).toHaveTextContent("Deleted toggle payments.card");
  });

  it("refetches with the selected category when a chip is clicked", async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse(200, { data: [entry()], next_cursor: "" }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<HistoryScreen />);
    await screen.findByText("Deleted toggle payments.card");

    await user.click(screen.getByRole("button", { name: "Keys" }));

    await waitFor(() => {
      const lastCallUrl = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string;
      expect(lastCallUrl).toContain("category=keys");
    });
  });

  it("loads the next page and appends it when the sentinel intersects", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("cursor=")) {
        return Promise.resolve(jsonResponse(200, { data: [entry({ id: "older", text: "Older event" })], next_cursor: "" }));
      }
      return Promise.resolve(jsonResponse(200, { data: [entry({ id: "newer", text: "Newer event" })], next_cursor: "opaque-cursor" }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HistoryScreen />);
    await screen.findByText("Newer event");

    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    FakeIntersectionObserver.instances[0].trigger(true);

    await screen.findByText("Older event");
    expect(screen.getByText("Newer event")).toBeInTheDocument();

    const lastCallUrl = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string;
    expect(lastCallUrl).toContain("cursor=opaque-cursor");
  });

  it("does not render a sentinel once there is no next page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => jsonResponse(200, { data: [entry()], next_cursor: "" })));

    render(<HistoryScreen />);
    await screen.findByText("Deleted toggle payments.card");

    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });

  // v2.6 §7: AuditToolbar — filtro por ator, por intervalo, e export CSV.
  it("fetches the actor list once and lists actors in the toolbar select", async () => {
    vi.stubGlobal("fetch", fetchMockWithActors({ data: [entry()], next_cursor: "" }));

    render(<HistoryScreen />);
    await screen.findByText("Deleted toggle payments.card");

    expect(screen.getByRole("option", { name: "alice" })).toBeInTheDocument();
  });

  it("refetches with actor_id when an actor is selected", async () => {
    const fetchMock = fetchMockWithActors({ data: [entry()], next_cursor: "" });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<HistoryScreen />);
    await screen.findByText("Deleted toggle payments.card");

    await user.selectOptions(screen.getByRole("combobox"), "u1");

    await waitFor(() => {
      const lastCallUrl = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string;
      expect(lastCallUrl).toContain("actor_id=u1");
    });
  });

  it("refetches with range when a range chip is clicked", async () => {
    const fetchMock = fetchMockWithActors({ data: [entry()], next_cursor: "" });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<HistoryScreen />);
    await screen.findByText("Deleted toggle payments.card");

    await user.click(screen.getByRole("button", { name: "7 days" }));

    await waitFor(() => {
      const lastCallUrl = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string;
      expect(lastCallUrl).toContain("range=7d");
    });
  });

  it("disables Export CSV when there are no entries, enables it once loaded, and exports the loaded entries", async () => {
    vi.stubGlobal("fetch", fetchMockWithActors({ data: [entry()], next_cursor: "" }));
    const user = userEvent.setup();

    render(<HistoryScreen />);
    await screen.findByText("Deleted toggle payments.card");

    const exportButton = screen.getByRole("button", { name: /export csv/i });
    expect(exportButton).toBeEnabled();

    await user.click(exportButton);

    expect(downloadCSV).toHaveBeenCalledTimes(1);
    expect(downloadCSV).toHaveBeenCalledWith([expect.objectContaining({ id: "au1" })], "totoggle-history.csv");
  });

  it("disables Export CSV when the history is empty", async () => {
    vi.stubGlobal("fetch", fetchMockWithActors({ data: [], next_cursor: "" }, []));

    render(<HistoryScreen />);
    await screen.findByText("Nothing here yet");

    expect(screen.getByRole("button", { name: /export csv/i })).toBeDisabled();
  });
});
