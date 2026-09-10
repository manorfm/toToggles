import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { createRunner, createSidecarServer, loadConfigFromEnv, type Runner } from "./runner.js";

const servers: Server[] = [];
const runners: Runner[] = [];

afterEach(async () => {
  runners.splice(0).forEach((runner) => runner.close());
  await Promise.all(servers.splice(0).map(async (server) => {
    server.close();
    await once(server, "close");
  }));
});

describe("Node stress SDK runner", () => {
  it("evaluates domain and network rules through the real request-local resolver", async () => {
    const catalog = await catalogServer();
    const runner = await createRunner({ serverUrl: catalog.url, secretKey: "sk_stress", httpTimeoutMs: 1_000 });
    runners.push(runner);
    const sidecar = createSidecarServer(runner);
    const address = await listen(sidecar);

    await expect(evaluate(address, { path: "payments.card", context: { attributes: { plan: "pro" } } })).resolves.toEqual({ active: true });
    await expect(evaluate(address, { path: "payments.card", context: { attributes: { plan: "free" } } })).resolves.toEqual({ active: false });
    await expect(evaluate(address, { path: "network.v6", context: {} }, { Forwarded: 'for="[2001:db8::44]"' })).resolves.toEqual({ active: true });
    await expect(evaluate(address, { path: "location.br", context: {} }, { "CF-IPCountry": "BR" })).resolves.toEqual({ active: true });
  });

  it("rejects malformed context without echoing it", async () => {
    const catalog = await catalogServer();
    const runner = await createRunner({ serverUrl: catalog.url, secretKey: "sk_stress", httpTimeoutMs: 1_000 });
    runners.push(runner);
    const sidecar = createSidecarServer(runner);
    const address = await listen(sidecar);

    const response = await fetch(`http://127.0.0.1:${address.port}/evaluate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "payments.card", context: { userId: "sensitive-user" }, unexpected: true }),
    });
    expect(response.status).toBe(400);
    await expect(response.text()).resolves.not.toContain("sensitive-user");
  });

  it("reports sidecar health without exposing catalog details", async () => {
    const catalog = await catalogServer();
    const runner = await createRunner({ serverUrl: catalog.url, secretKey: "sk_stress", httpTimeoutMs: 1_000 });
    runners.push(runner);
    const sidecar = createSidecarServer(runner);
    const address = await listen(sidecar);

    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("requires explicit catalog credentials and a loopback bind address", () => {
    expect(() => loadConfigFromEnv({})).toThrow("STRESS_SERVER_URL and STRESS_SECRET_KEY are required");
    expect(() => loadConfigFromEnv({ STRESS_SERVER_URL: "http://127.0.0.1:8080", STRESS_SECRET_KEY: "sk_stress", STRESS_NODE_BIND: "0.0.0.0" })).toThrow("loopback");
    expect(loadConfigFromEnv({ STRESS_SERVER_URL: "http://127.0.0.1:8080", STRESS_SECRET_KEY: "sk_stress" })).toMatchObject({ bindAddress: "127.0.0.1", port: 19092 });
  });

  it("requires acknowledgement before a runner targets a remote catalog", () => {
    const remote = { STRESS_SERVER_URL: "https://stress.example.test", STRESS_SECRET_KEY: "sk_stress" };
    expect(() => loadConfigFromEnv(remote)).toThrow("non-loopback");
    expect(loadConfigFromEnv({ ...remote, ALLOW_NON_LOOPBACK_STRESS_TARGETS: "yes" })).toMatchObject({ serverUrl: remote.STRESS_SERVER_URL });
  });

  it("rejects catalog URLs with query or fragment components", () => {
    const required = { STRESS_SECRET_KEY: "sk_stress" };
    expect(() => loadConfigFromEnv({ ...required, STRESS_SERVER_URL: "http://127.0.0.1:8080?unexpected=true" })).toThrow("absolute HTTP(S)");
    expect(() => loadConfigFromEnv({ ...required, STRESS_SERVER_URL: "http://127.0.0.1:8080#fragment" })).toThrow("absolute HTTP(S)");
  });
});

async function catalogServer(): Promise<{ url: string }> {
  const server = createServer((request, response) => {
    expect(request.headers["x-api-key"]).toBe("sk_stress");
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ application: { toggles: [
      toggle("1", "payments.card", { type: "attribute", value: "pro", config: { context_key: "attributes.plan" } }),
      toggle("2", "network.v6", { type: "ip", value: "2001:db8::/32", config: { context_key: "ip" } }),
      toggle("3", "location.br", { type: "country", value: "BR", config: { context_key: "country" } }),
    ] } }));
  });
  const address = await listen(server);
  return { url: `http://127.0.0.1:${address.port}` };
}

function toggle(id: string, path: string, activationRule: object): object {
  return {
    id,
    path,
    value: path.split(".").at(-1),
    enabled: true,
    level: path.split(".").length - 1,
    parent_id: null,
    app_id: "stress-app",
    has_activation_rule: true,
    activation_rule: activationRule,
  };
}

async function listen(server: Server): Promise<{ port: number }> {
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("test server did not expose a TCP port");
  return { port: address.port };
}

async function evaluate(address: { port: number }, body: unknown, headers: Record<string, string> = {}): Promise<{ active: boolean }> {
  const response = await fetch(`http://127.0.0.1:${address.port}/evaluate`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(200);
  return response.json() as Promise<{ active: boolean }>;
}
