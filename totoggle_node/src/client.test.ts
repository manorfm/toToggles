import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { ToToggleClient } from "./client.js";
import { createConfig } from "./config.js";
import { TotoggleAuthenticationError } from "./errors.js";
import type { ToToggleMetricsListener } from "./metrics.js";

let server: Server | undefined;

function listen(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<string> {
  server = createServer(handler);
  return new Promise((resolve) => {
    server!.listen(0, "127.0.0.1", () => {
      const address = server!.address();
      if (address === null || typeof address === "string") {
        throw new Error("unexpected server address");
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function fixedResponseServer(toggles: unknown[]): Promise<{ url: string; hits: () => number }> {
  let hits = 0;
  return listen((_req, res) => {
    hits++;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ application: { id: "app-1", name: "Test App", toggles } }));
  }).then((url) => ({ url, hits: () => hits }));
}

function toggleJson(
  id: string,
  path: string,
  enabled: boolean,
  level: number,
  parentId: string | null,
  hasRule: boolean,
  ruleType?: string,
  ruleValue?: string,
): unknown {
  return {
    id,
    path,
    value: path,
    enabled,
    level,
    parent_id: parentId,
    app_id: "app-1",
    has_activation_rule: hasRule,
    activation_rule: hasRule ? { type: ruleType, value: ruleValue } : null,
  };
}

async function waitUntil(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error("waitUntil: timed out");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

afterEach(() => {
  server?.close();
  server = undefined;
});

describe("ToToggleClient", () => {
  it("fetches initial data synchronously during start", async () => {
    const { url, hits } = await fixedResponseServer([toggleJson("1", "user", true, 0, null, false)]);
    const client = new ToToggleClient(
      createConfig("test-app", url, "sk_test123", { refreshIntervalMs: 60 * 60 * 1000 }),
    );
    await client.start();

    expect(hits()).toBe(1);
    expect(client.isActive("user")).toBe(true);
    client.shutdown();
  });

  it("isActive before start returns false", () => {
    const client = new ToToggleClient(createConfig("test-app", "http://unused.invalid", "sk_test"));
    expect(client.isActive("user")).toBe(false);
  });

  it("isActive after shutdown returns false", async () => {
    const { url } = await fixedResponseServer([toggleJson("1", "user", true, 0, null, false)]);
    const client = new ToToggleClient(
      createConfig("test-app", url, "sk_test", { refreshIntervalMs: 60 * 60 * 1000 }),
    );
    await client.start();
    client.shutdown();

    expect(client.isActive("user")).toBe(false);
  });

  it("isActive for an unknown path returns false", async () => {
    const { url } = await fixedResponseServer([toggleJson("1", "user", true, 0, null, false)]);
    const client = new ToToggleClient(
      createConfig("test-app", url, "sk_test", { refreshIntervalMs: 60 * 60 * 1000 }),
    );
    await client.start();

    expect(client.isActive("does.not.exist")).toBe(false);
    client.shutdown();
  });

  it("isActive for a malformed path (invalid Path) returns false instead of throwing", async () => {
    const { url } = await fixedResponseServer([toggleJson("1", "user", true, 0, null, false)]);
    const client = new ToToggleClient(
      createConfig("test-app", url, "sk_test", { refreshIntervalMs: 60 * 60 * 1000 }),
    );
    await client.start();

    expect(client.isActive("")).toBe(false);
    expect(client.isActive(".leading.dot")).toBe(false);
    client.shutdown();
  });

  // A rule type the server added after this client shipped has no registered Evaluator — fails
  // closed to false rather than throwing out of isActive.
  it("a toggle with an unregistered rule type fails closed to false", async () => {
    const { url } = await fixedResponseServer([
      toggleJson("1", "user", true, 0, null, true, "some-future-rule-type", "x"),
    ]);
    const client = new ToToggleClient(
      createConfig("test-app", url, "sk_test", { refreshIntervalMs: 60 * 60 * 1000 }),
    );
    await client.start();

    expect(client.isActive("user")).toBe(false);
    client.shutdown();
  });

  // A refresh already in flight when shutdown() is called must not apply its result afterwards
  // — shutdown() means stop, even for work that was already underway — AND must not leave the
  // background interval running (start() would otherwise set it up unconditionally right after
  // the in-flight fetch resolves, regardless of the shutdown that happened in the meantime).
  it("discards an in-flight refresh's result and starts no background loop if shutdown happens first", async () => {
    let resolveResponse: (() => void) | undefined;
    let hits = 0;
    const url = await listen((_req, res) => {
      hits++;
      res.setHeader("Content-Type", "application/json");
      resolveResponse = () => {
        res.end(
          JSON.stringify({
            application: { id: "app-1", name: "x", toggles: [toggleJson("1", "user", true, 0, null, false)] },
          }),
        );
      };
    });
    const client = new ToToggleClient(createConfig("test-app", url, "sk_test", { refreshIntervalMs: 15 }));

    const startPromise = client.start();
    await waitUntil(() => resolveResponse !== undefined);
    client.shutdown();
    resolveResponse!();
    await startPromise;

    expect(client.isActive("user")).toBe(false); // shutdown, not because the refresh landed
    expect(client.isHealthy()).toBe(false);

    const hitsAfterStart = hits;
    await new Promise((resolve) => setTimeout(resolve, 100)); // well past the 15ms interval
    expect(hits).toBe(hitsAfterStart); // no background refetch after shutdown
  });

  it("isActive for a disabled toggle returns false", async () => {
    const { url } = await fixedResponseServer([toggleJson("1", "user", false, 0, null, false)]);
    const client = new ToToggleClient(
      createConfig("test-app", url, "sk_test", { refreshIntervalMs: 60 * 60 * 1000 }),
    );
    await client.start();

    expect(client.isActive("user")).toBe(false);
    client.shutdown();
  });

  // The user's own t1.t2.t3 hierarchy example: a disabled ancestor blocks every descendant,
  // even though the descendant itself is enabled.
  it("a disabled ancestor blocks every descendant", async () => {
    const { url } = await fixedResponseServer([
      toggleJson("1", "t1", false, 0, null, false),
      toggleJson("2", "t1.t2", true, 1, "1", false),
      toggleJson("3", "t1.t2.t3", true, 2, "2", false),
    ]);
    const client = new ToToggleClient(
      createConfig("test-app", url, "sk_test", { refreshIntervalMs: 60 * 60 * 1000 }),
    );
    await client.start();

    expect(client.isActive("t1.t2.t3")).toBe(false);
    expect(client.isActive("t1.t2")).toBe(false);
    expect(client.isActive("t1")).toBe(false);
    client.shutdown();
  });

  it("all ancestors enabled with no rules returns true", async () => {
    const { url } = await fixedResponseServer([
      toggleJson("1", "t1", true, 0, null, false),
      toggleJson("2", "t1.t2", true, 1, "1", false),
      toggleJson("3", "t1.t2.t3", true, 2, "2", false),
    ]);
    const client = new ToToggleClient(
      createConfig("test-app", url, "sk_test", { refreshIntervalMs: 60 * 60 * 1000 }),
    );
    await client.start();

    expect(client.isActive("t1.t2.t3")).toBe(true);
    client.shutdown();
  });

  // Regression coverage for the exact bug fixed in the Kotlin client this session: the
  // parameter passed to isActiveFor must be forwarded to EVERY ancestor's rule evaluation, not
  // just the target's.
  it("isActiveFor forwards the parameter to an ancestor's rule", async () => {
    const { url } = await fixedResponseServer([
      toggleJson("1", "t1", true, 0, null, true, "parameter", "premium,enterprise"),
      toggleJson("2", "t1.t2", true, 1, "1", false),
    ]);
    const client = new ToToggleClient(
      createConfig("test-app", url, "sk_test", { refreshIntervalMs: 60 * 60 * 1000 }),
    );
    await client.start();

    expect(client.isActiveFor("t1.t2", "premium")).toBe(true);
    expect(client.isActiveFor("t1.t2", "basic")).toBe(false);
    expect(client.isActive("t1.t2")).toBe(false); // no parameter: the ancestor rule can never match
    client.shutdown();
  });

  it("isActiveFor evaluates the target's own rule", async () => {
    const { url } = await fixedResponseServer([
      toggleJson("1", "user", true, 0, null, true, "country", "BR,US"),
    ]);
    const client = new ToToggleClient(
      createConfig("test-app", url, "sk_test", { refreshIntervalMs: 60 * 60 * 1000 }),
    );
    await client.start();

    expect(client.isActiveFor("user", "BR")).toBe(true);
    expect(client.isActiveFor("user", "FR")).toBe(false);
    client.shutdown();
  });

  it("percentage rule is deterministic per key", async () => {
    const { url } = await fixedResponseServer([
      toggleJson("1", "rollout", true, 0, null, true, "percentage", "50"),
    ]);
    const client = new ToToggleClient(
      createConfig("test-app", url, "sk_test", { refreshIntervalMs: 60 * 60 * 1000 }),
    );
    await client.start();

    const first = client.isActiveFor("rollout", "user-42");
    for (let i = 0; i < 10; i++) {
      expect(client.isActiveFor("rollout", "user-42")).toBe(first);
    }
    client.shutdown();
  });

  it("refresh forces an immediate fetch", async () => {
    const { url, hits } = await fixedResponseServer([toggleJson("1", "user", true, 0, null, false)]);
    const client = new ToToggleClient(
      createConfig("test-app", url, "sk_test", { refreshIntervalMs: 60 * 60 * 1000 }),
    );
    await client.start();

    await client.refresh();
    expect(hits()).toBe(2);
    client.shutdown();
  });

  it("refresh before start rejects", async () => {
    const client = new ToToggleClient(createConfig("test-app", "http://unused.invalid", "sk_test"));
    await expect(client.refresh()).rejects.toThrow();
  });

  it("refresh after shutdown rejects", async () => {
    const { url } = await fixedResponseServer([toggleJson("1", "user", true, 0, null, false)]);
    const client = new ToToggleClient(
      createConfig("test-app", url, "sk_test", { refreshIntervalMs: 60 * 60 * 1000 }),
    );
    await client.start();
    client.shutdown();

    await expect(client.refresh()).rejects.toThrow();
  });

  it("refresh propagates the fetch error", async () => {
    const url = await listen((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    const client = new ToToggleClient(
      createConfig("test-app", url, "sk_test", { refreshIntervalMs: 60 * 60 * 1000 }),
    );
    await client.start(); // start never fails on a bad initial fetch

    await expect(client.refresh()).rejects.toBeInstanceOf(TotoggleAuthenticationError);
    client.shutdown();
  });

  it("start twice is idempotent", async () => {
    const { url, hits } = await fixedResponseServer([toggleJson("1", "user", true, 0, null, false)]);
    const client = new ToToggleClient(
      createConfig("test-app", url, "sk_test", { refreshIntervalMs: 60 * 60 * 1000 }),
    );
    await client.start();
    await client.start();

    expect(hits()).toBe(1);
    client.shutdown();
  });

  it("start after shutdown rejects", async () => {
    const { url } = await fixedResponseServer([toggleJson("1", "user", true, 0, null, false)]);
    const client = new ToToggleClient(
      createConfig("test-app", url, "sk_test", { refreshIntervalMs: 60 * 60 * 1000 }),
    );
    await client.start();
    client.shutdown();

    await expect(client.start()).rejects.toThrow();
  });

  it("shutdown twice is safe", async () => {
    const { url } = await fixedResponseServer([toggleJson("1", "user", true, 0, null, false)]);
    const client = new ToToggleClient(
      createConfig("test-app", url, "sk_test", { refreshIntervalMs: 60 * 60 * 1000 }),
    );
    await client.start();

    expect(() => {
      client.shutdown();
      client.shutdown();
    }).not.toThrow();
  });

  it("shutdown before start is safe", () => {
    const client = new ToToggleClient(createConfig("test-app", "http://unused.invalid", "sk_test"));
    expect(() => client.shutdown()).not.toThrow();
  });

  it("background refresh refetches on the configured interval", async () => {
    const { url, hits } = await fixedResponseServer([toggleJson("1", "user", true, 0, null, false)]);
    const client = new ToToggleClient(
      createConfig("test-app", url, "sk_test", { refreshIntervalMs: 20 }),
    );
    await client.start();

    await waitUntil(() => hits() >= 3);
    client.shutdown();
  });

  it("isHealthy is true after a successful start", async () => {
    const { url } = await fixedResponseServer([toggleJson("1", "user", true, 0, null, false)]);
    const client = new ToToggleClient(
      createConfig("test-app", url, "sk_test", { refreshIntervalMs: 60 * 60 * 1000 }),
    );
    await client.start();

    expect(client.isHealthy()).toBe(true);
    expect(client.isStale()).toBe(false);
    client.shutdown();
  });

  it("isHealthy is false before start", () => {
    const client = new ToToggleClient(createConfig("test-app", "http://unused.invalid", "sk_test"));
    expect(client.isHealthy()).toBe(false);
  });

  it("isHealthy is false when the initial fetch never succeeds", async () => {
    const url = await listen((_req, res) => {
      res.writeHead(500);
      res.end();
    });
    const client = new ToToggleClient(
      createConfig("test-app", url, "sk_test", { refreshIntervalMs: 60 * 60 * 1000 }),
    );
    await client.start();

    expect(client.isHealthy()).toBe(false);
    expect(client.isStale()).toBe(true);
    expect(client.consecutiveFailureCount()).toBe(1);
    expect(client.lastError()).not.toBeNull();
    expect(client.lastErrorTime()).not.toBeNull();
    client.shutdown();
  });

  it("addMetricsListener observes refresh success and evaluation", async () => {
    const { url } = await fixedResponseServer([toggleJson("1", "user", true, 0, null, false)]);
    const client = new ToToggleClient(
      createConfig("test-app", url, "sk_test", { refreshIntervalMs: 60 * 60 * 1000 }),
    );

    const successCounts: number[] = [];
    const evaluations: Array<[string, boolean]> = [];
    const listener: ToToggleMetricsListener = {
      onRefreshSuccess: (count) => successCounts.push(count),
      onEvaluation: (path, result) => evaluations.push([path, result]),
    };
    client.addMetricsListener(listener);

    await client.start();
    client.isActive("user");

    expect(successCounts).toEqual([1]);
    expect(evaluations).toEqual([["user", true]]);
    client.shutdown();
  });

  it("addMetricsListener observes refresh failure", async () => {
    const url = await listen((_req, res) => {
      res.writeHead(500);
      res.end();
    });
    const client = new ToToggleClient(
      createConfig("test-app", url, "sk_test", { refreshIntervalMs: 60 * 60 * 1000 }),
    );

    const failures: Array<[string, number]> = [];
    client.addMetricsListener({
      onRefreshFailure: (err, count) => failures.push([err.message, count]),
    });

    await client.start();

    expect(failures).toHaveLength(1);
    expect(failures[0]![1]).toBe(1);
    client.shutdown();
  });
});
