import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationsScreen } from "./ApplicationsScreen";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("ApplicationsScreen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders every application returned by the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, [
          { id: "1", name: "Checkout Web", created_at: "", updated_at: "", toggles_total: 12, toggles_enabled: 9, toggles_disabled: 3 },
          { id: "2", name: "Mobile App", created_at: "", updated_at: "", toggles_total: 4, toggles_enabled: 1, toggles_disabled: 3 },
        ])
      )
    );

    render(<ApplicationsScreen />);

    expect(await screen.findByText("Checkout Web")).toBeInTheDocument();
    expect(screen.getByText("Mobile App")).toBeInTheDocument();
  });

  it("shows an empty state when there are no applications", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, [])));

    render(<ApplicationsScreen />);

    expect(await screen.findByText(/nenhuma aplicação/i)).toBeInTheDocument();
  });

  it("shows the API's error message when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, { code: "T0005", message: "internal error" })));

    render(<ApplicationsScreen />);

    expect(await screen.findByText(/internal error/i)).toBeInTheDocument();
  });
});
