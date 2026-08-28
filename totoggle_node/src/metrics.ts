/**
 * Optional observability hook — register via Client.addMetricsListener to wire refresh/
 * evaluation events into your own metrics system without this library taking on a dependency on
 * any of them. Every method is optional (TypeScript supports this natively, unlike Go, which
 * needed 3 separate interfaces plus a type-assertion workaround for the same "implement only
 * what you care about" behavior) — implement only the ones you need.
 */
export interface ToToggleMetricsListener {
  /** Called after a successful background (or forced, via Client.refresh) refresh. */
  onRefreshSuccess?(toggleCount: number): void;
  /** Called after a failed refresh attempt, with the running count of consecutive failures
   * (reset to 0 on the next success). */
  onRefreshFailure?(error: Error, consecutiveFailures: number): void;
  /** Called after every isActive/isActiveFor call that completed (including ones that resolved
   * to false because the toggle wasn't found, or the client wasn't started). */
  onEvaluation?(path: string, result: boolean): void;
}

/** Holds the listeners registered via Client.addMetricsListener and dispatches to whichever
 * methods each one implements. A listener that throws is caught and discarded per call — a
 * broken listener must never break toggle evaluation or the background refresh. */
export class MetricsDispatcher {
  private readonly listeners: ToToggleMetricsListener[] = [];

  add(listener: ToToggleMetricsListener): void {
    this.listeners.push(listener);
  }

  notifyRefreshSuccess(toggleCount: number): void {
    for (const listener of this.listeners) {
      this.safeCall(() => listener.onRefreshSuccess?.(toggleCount));
    }
  }

  notifyRefreshFailure(error: Error, consecutiveFailures: number): void {
    for (const listener of this.listeners) {
      this.safeCall(() => listener.onRefreshFailure?.(error, consecutiveFailures));
    }
  }

  notifyEvaluation(path: string, result: boolean): void {
    for (const listener of this.listeners) {
      this.safeCall(() => listener.onEvaluation?.(path, result));
    }
  }

  private safeCall(fn: () => void): void {
    try {
      fn();
    } catch {
      // Discarded deliberately — see class doc.
    }
  }
}
