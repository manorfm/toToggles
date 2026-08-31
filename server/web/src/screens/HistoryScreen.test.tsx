import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HistoryScreen } from "./HistoryScreen";

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
    actor_id: "u1",
    actor_name: "alice",
    created_at: "2026-08-30T10:00:00Z",
    ...overrides,
  };
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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { data: [], next_cursor: "" })));

    render(<HistoryScreen />);

    expect(await screen.findByText("Nothing here yet")).toBeInTheDocument();
  });

  it("lists entries in the order the server returns them (newest first)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
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
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: [entry()], next_cursor: "" }));
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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { data: [entry()], next_cursor: "" })));

    render(<HistoryScreen />);
    await screen.findByText("Deleted toggle payments.card");

    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });
});
