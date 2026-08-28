import { describe, expect, it } from "vitest";
import { MetricsDispatcher } from "./metrics.js";
import type { ToToggleMetricsListener } from "./metrics.js";

describe("MetricsDispatcher", () => {
  it("calls only the methods a partial listener implements", () => {
    const dispatcher = new MetricsDispatcher();
    const successCounts: number[] = [];
    const listener: ToToggleMetricsListener = {
      onRefreshSuccess: (count) => successCounts.push(count),
    };
    dispatcher.add(listener);

    dispatcher.notifyRefreshSuccess(3);
    dispatcher.notifyRefreshFailure(new Error("boom"), 1);
    dispatcher.notifyEvaluation("t1", true);

    expect(successCounts).toEqual([3]);
  });

  it("dispatches to all three methods when a listener implements all three", () => {
    const dispatcher = new MetricsDispatcher();
    const calls: string[] = [];
    const listener: ToToggleMetricsListener = {
      onRefreshSuccess: (count) => calls.push(`success:${count}`),
      onRefreshFailure: (err, failures) => calls.push(`failure:${err.message}:${failures}`),
      onEvaluation: (path, result) => calls.push(`eval:${path}:${result}`),
    };
    dispatcher.add(listener);

    dispatcher.notifyRefreshSuccess(5);
    dispatcher.notifyRefreshFailure(new Error("boom"), 2);
    dispatcher.notifyEvaluation("t1.t2", false);

    expect(calls).toEqual(["success:5", "failure:boom:2", "eval:t1.t2:false"]);
  });

  // A broken listener must never take down evaluation or the refresh loop.
  it("a throwing listener does not propagate or block later listeners", () => {
    const dispatcher = new MetricsDispatcher();
    const calls: string[] = [];
    dispatcher.add({
      onEvaluation: () => {
        throw new Error("listener bug");
      },
    });
    dispatcher.add({ onEvaluation: (path) => calls.push(path) });

    expect(() => dispatcher.notifyEvaluation("t1", true)).not.toThrow();
    expect(calls).toEqual(["t1"]);
  });

  it("an empty listener object registers for nothing and never throws", () => {
    const dispatcher = new MetricsDispatcher();
    dispatcher.add({});

    expect(() => {
      dispatcher.notifyRefreshSuccess(1);
      dispatcher.notifyRefreshFailure(new Error("x"), 1);
      dispatcher.notifyEvaluation("t1", true);
    }).not.toThrow();
  });
});
