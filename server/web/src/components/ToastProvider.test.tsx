import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./ToastProvider";

function Trigger({ message }: { message: string }) {
  const notify = useToast();
  return <button onClick={() => notify(message)}>fire</button>;
}

describe("ToastProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("throws when useToast is called outside a provider", () => {
    // Silencia o console.error que o React imprime pro erro não-tratado do render.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Trigger message="x" />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });

  it("shows a toast on notify and auto-dismisses it after 2.6s", async () => {
    render(
      <ToastProvider>
        <Trigger message="Application created" />
      </ToastProvider>
    );

    expect(screen.queryByText("Application created")).not.toBeInTheDocument();

    await act(async () => {
      screen.getByText("fire").click();
    });
    expect(screen.getByText("Application created")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2600);
    });
    expect(screen.queryByText("Application created")).not.toBeInTheDocument();
  });

  it("stacks multiple toasts independently", async () => {
    render(
      <ToastProvider>
        <Trigger message="First" />
        <Trigger message="Second" />
      </ToastProvider>
    );

    const [first, second] = screen.getAllByText("fire");
    await act(async () => {
      first.click();
      second.click();
    });

    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
  });
});
