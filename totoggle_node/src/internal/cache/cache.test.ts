import { describe, expect, it } from "vitest";
import { Path } from "../toggle/path.js";
import { Application } from "../toggle/application.js";
import type { Toggle } from "../toggle/toggle.js";
import { Cache } from "./cache.js";

function toggle(path: string, overrides: Partial<Toggle> = {}): Toggle {
  return {
    id: path,
    path: Path.parse(path),
    value: path,
    enabled: true,
    level: 0,
    parentId: null,
    appId: "app-1",
    hasActivationRule: false,
    activationRule: null,
    ...overrides,
  };
}

describe("Cache", () => {
  it("stores an Application and records success stats on update", () => {
    const cache = new Cache();
    const before = Date.now();

    cache.update(new Application([toggle("t1")]));

    const stats = cache.stats();
    expect(stats.toggleCount).toBe(1);
    expect(stats.lastSuccessAt).not.toBeNull();
    expect(stats.lastSuccessAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(stats.consecutiveFailures).toBe(0);
  });

  it("get returns the target and its ancestors", () => {
    const cache = new Cache();
    const t1 = toggle("t1");
    const t1t2 = toggle("t1.t2", { enabled: false });
    cache.update(new Application([t1, t1t2]));

    const result = cache.get(Path.parse("t1.t2"));
    expect(result).not.toBeNull();
    expect(result!.target).toEqual(t1t2);
    expect(result!.ancestors).toEqual([t1]);
  });

  it("get returns null for a path never fetched", () => {
    const cache = new Cache();
    cache.update(new Application([]));

    expect(cache.get(Path.parse("missing"))).toBeNull();
  });

  it("get returns null before any update", () => {
    const cache = new Cache();
    expect(cache.get(Path.parse("t1"))).toBeNull();
  });

  // A failed refresh must never blank out previously-fetched data — stale-but-present beats
  // empty.
  it("recordFailure keeps prior data and tracks the failure", () => {
    const cache = new Cache();
    cache.update(new Application([toggle("t1")]));

    const failure = new Error("server unreachable");
    cache.recordFailure(failure);
    cache.recordFailure(failure);

    expect(cache.get(Path.parse("t1"))!.target.id).toBe("t1");
    const stats = cache.stats();
    expect(stats.consecutiveFailures).toBe(2);
    expect(stats.lastError).toBe(failure);
    expect(stats.lastErrorAt).not.toBeNull();
  });

  it("update resets the consecutive failure count", () => {
    const cache = new Cache();
    cache.recordFailure(new Error("boom"));
    cache.recordFailure(new Error("boom"));

    cache.update(new Application([]));

    expect(cache.stats().consecutiveFailures).toBe(0);
  });

  it("clear removes data and resets stats", () => {
    const cache = new Cache();
    cache.update(new Application([toggle("t1")]));
    cache.recordFailure(new Error("boom"));

    cache.clear();

    expect(cache.get(Path.parse("t1"))).toBeNull();
    const stats = cache.stats();
    expect(stats.toggleCount).toBe(0);
    expect(stats.lastSuccessAt).toBeNull();
    expect(stats.consecutiveFailures).toBe(0);
  });

  // Node is single-threaded, but fetches are async and can interleave — a failure recorded from
  // an in-flight refresh must never race ahead of a later, already-applied success.
  it("interleaved update/recordFailure calls never corrupt the toggle data", async () => {
    const cache = new Cache();
    const ops = Array.from({ length: 50 }, (_, i) =>
      i % 2 === 0
        ? Promise.resolve().then(() => cache.update(new Application([toggle("t1")])))
        : Promise.resolve().then(() => cache.recordFailure(new Error("boom"))),
    );
    await Promise.all(ops);

    const result = cache.get(Path.parse("t1"));
    expect(result === null || result.target.id === "t1").toBe(true);
  });
});
