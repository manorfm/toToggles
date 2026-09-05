import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SuggestChangeModal } from "./SuggestChangeModal";
import type { ToggleLeaf } from "../types/toggle";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function leaf(overrides: Partial<ToggleLeaf> = {}): ToggleLeaf {
  return {
    leafId: "leaf-1",
    root: "payments",
    segs: ["payments", "card"],
    ids: ["root-1", "leaf-1"],
    rules: [false, false],
    enabledOwn: [true, true],
    ...overrides,
  };
}

describe("SuggestChangeModal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("offers to disable a currently-enabled toggle", () => {
    render(<SuggestChangeModal applicationId="app1" leaf={leaf()} onClose={vi.fn()} onSuggested={vi.fn()} />);

    expect(screen.getByText("payments.card")).toBeInTheDocument();
    expect(screen.getByText("disable")).toBeInTheDocument();
  });

  it("offers to enable a currently-disabled toggle", () => {
    render(<SuggestChangeModal applicationId="app1" leaf={leaf({ enabledOwn: [true, false] })} onClose={vi.fn()} onSuggested={vi.fn()} />);

    expect(screen.getByText("enable")).toBeInTheDocument();
  });

  it("posts the suggestion with the note and calls onSuggested + onClose", async () => {
    let body: unknown = null;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((path: string, init?: RequestInit) => {
        body = JSON.parse(init!.body as string);
        expect(path).toBe("/api/applications/app1/toggles/leaf-1/suggest");
        return Promise.resolve(jsonResponse(201, { message: "suggestion sent to the team's approvers" }));
      })
    );
    const onSuggested = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<SuggestChangeModal applicationId="app1" leaf={leaf()} onClose={onClose} onSuggested={onSuggested} />);
    await user.type(screen.getByPlaceholderText("Why this change?"), "no longer needed");
    await user.click(screen.getByRole("button", { name: /send suggestion/i }));

    await vi.waitFor(() => expect(onSuggested).toHaveBeenCalledTimes(1));
    expect(body).toEqual({ enabled: false, note: "no longer needed" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the server's error message without closing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(403, { code: "A0001", message: "not a member of this team" })));
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<SuggestChangeModal applicationId="app1" leaf={leaf()} onClose={onClose} onSuggested={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /send suggestion/i }));

    expect(await screen.findByText("not a member of this team")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
