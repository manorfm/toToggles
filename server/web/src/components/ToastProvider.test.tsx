import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./ToastProvider";

function Trigger({ message }: { message: string }) {
  const notify = useToast();
  return <button onClick={() => notify(message)}>fire</button>;
}

function TriggerWithAction({ message, label, onAction }: { message: string; label: string; onAction: () => void }) {
  const notify = useToast();
  return <button onClick={() => notify(message, { label, onAction })}>fire</button>;
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

  // v2.6 (bundle real decodificado — ver server/CLAUDE.md): `toast(msg, action)` usa 3.2s sem
  // ação, 8s com ação — bump em relação à v2.3 (2.6s fixo), confirmado no app.jsx real:
  // `setTimeout(..., action ? 8000 : 3200)`.
  it("shows a toast on notify and auto-dismisses it after 3.2s when there's no action", async () => {
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
      vi.advanceTimersByTime(3199);
    });
    expect(screen.getByText("Application created")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText("Application created")).not.toBeInTheDocument();
  });

  it("keeps a toast with an action alive past 3.2s, dismissing only at 8s", async () => {
    render(
      <ToastProvider>
        <TriggerWithAction message="Toggle deleted" label="Undo" onAction={vi.fn()} />
      </ToastProvider>
    );

    await act(async () => {
      screen.getByText("fire").click();
    });
    expect(screen.getByText("Toggle deleted")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(3200);
    });
    expect(screen.getByText("Toggle deleted")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(4800);
    });
    expect(screen.queryByText("Toggle deleted")).not.toBeInTheDocument();
  });

  it("renders an underlined action button that calls onAction and dismisses the toast immediately", async () => {
    const onAction = vi.fn();
    render(
      <ToastProvider>
        <TriggerWithAction message="Toggle deleted" label="Undo" onAction={onAction} />
      </ToastProvider>
    );

    await act(async () => {
      screen.getByText("fire").click();
    });
    const actionButton = screen.getByRole("button", { name: "Undo" });
    expect(actionButton).toHaveClass("toast-action");

    await act(async () => {
      actionButton.click();
    });

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Toggle deleted")).not.toBeInTheDocument();
  });

  it("shows no action button when notify is called without one", async () => {
    render(
      <ToastProvider>
        <Trigger message="Application created" />
      </ToastProvider>
    );

    await act(async () => {
      screen.getByText("fire").click();
    });

    expect(screen.queryByRole("button", { name: /undo/i })).not.toBeInTheDocument();
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
