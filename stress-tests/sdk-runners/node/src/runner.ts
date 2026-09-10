import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createConfig, NodeRequestContextResolver, ToToggleClient } from "totoggle-node";

const DEFAULT_BIND_ADDRESS = "127.0.0.1";
const DEFAULT_PORT = 19092;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_REQUEST_BYTES = 16 * 1024;

export interface RunnerConfig {
  readonly serverUrl: string;
  readonly secretKey: string;
  readonly httpTimeoutMs: number;
  readonly bindAddress?: string;
  readonly port?: number;
  readonly allowNonLoopbackTarget?: boolean;
}

export interface Runner {
  readonly handle: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  close(): void;
}

interface DomainContext {
  readonly userId?: string;
  readonly rolloutKey?: string;
  readonly cohort?: string;
  readonly attributes?: Readonly<Record<string, string>>;
}

interface EvaluationRequest {
  readonly path: string;
  readonly context: DomainContext;
}

/**
 * Starts the production Node SDK and wraps it in a local stress-only HTTP surface. Domain values
 * are request-local through NodeRequestContextResolver; network values remain derived from the
 * actual loopback connection plus trusted Forwarded/CF-IPCountry headers.
 */
export async function createRunner(input: RunnerConfig): Promise<Runner> {
  const config = normalizeAndValidate(input);
  const contexts = new WeakMap<IncomingMessage, DomainContext>();
  const resolver = new NodeRequestContextResolver({
    trustedProxyAddresses: ["127.0.0.1", "::1"],
    values: (request) => contexts.get(request),
  });
  const client = new ToToggleClient(createConfig(
    "totoggle-stress-node-runner",
    config.serverUrl,
    config.secretKey,
    { httpTimeoutMs: config.httpTimeoutMs, refreshIntervalMs: 5_000, contextResolver: resolver },
  ));
  await client.start();
  if (!client.isHealthy()) {
    client.shutdown();
    throw new Error("SDK catalog was not available at startup");
  }

  let closed = false;
  return {
    handle: async (request, response) => {
      try {
        await handleEvaluation(request, response, client, resolver, contexts, () => closed);
      } catch {
        // Neither errors nor request data are logged: callers receive a stable, non-sensitive
        // response even if malformed input or an application resolver misbehaves.
        if (!response.headersSent) writeRejected(response, 500);
      }
    },
    close: () => {
      if (closed) return;
      closed = true;
      client.shutdown();
    },
  };
}

export function createSidecarServer(runner: Runner): Server {
  const server = createServer((request, response) => { void runner.handle(request, response); });
  server.requestTimeout = 10_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 30_000;
  return server;
}

async function handleEvaluation(
  request: IncomingMessage,
  response: ServerResponse,
  client: ToToggleClient,
  resolver: NodeRequestContextResolver,
  contexts: WeakMap<IncomingMessage, DomainContext>,
  isClosed: () => boolean,
): Promise<void> {
  if (request.url === "/health") {
    if (request.method !== "GET") return writeRejected(response, 405);
    if (isClosed() || !client.isHealthy()) return writeRejected(response, 503);
    return writeJson(response, 200, { status: "ok" });
  }
  if (request.url !== "/evaluate") return writeRejected(response, 404);
  if (request.method !== "POST") return writeRejected(response, 405);
  if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) return writeRejected(response, 415);
  const input = await decodeRequest(request);
  if (!input) return writeRejected(response, 400);
  if (isClosed() || !client.isHealthy()) return writeRejected(response, 503);

  contexts.set(request, input.context);
  try {
    const active = resolver.run(request, () => client.isActive(input.path));
    writeJson(response, 200, { active });
  } finally {
    contexts.delete(request);
  }
}

async function decodeRequest(request: IncomingMessage): Promise<EvaluationRequest | undefined> {
  const contentLength = Number(request.headers["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) return undefined;
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > MAX_REQUEST_BYTES) return undefined;
    chunks.push(buffer);
  }
  try {
    return validateRequest(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch {
    return undefined;
  }
}

function validateRequest(value: unknown): EvaluationRequest | undefined {
  if (!isPlainObject(value) || !hasOnlyKeys(value, ["path", "context"]) || typeof value.path !== "string" || value.path.trim() === "" || value.path.length > 512) return undefined;
  const context = validateContext(value.context);
  return context === undefined ? undefined : { path: value.path, context };
}

function validateContext(value: unknown): DomainContext | undefined {
  if (!isPlainObject(value) || !hasOnlyKeys(value, ["userId", "rolloutKey", "cohort", "attributes"])) return undefined;
  const strings = [value.userId, value.rolloutKey, value.cohort];
  if (strings.some((field) => field !== undefined && (typeof field !== "string" || field.length > 1_024))) return undefined;
  const attributes = validateAttributes(value.attributes);
  if (attributes === undefined && value.attributes !== undefined) return undefined;
  return { userId: value.userId as string | undefined, rolloutKey: value.rolloutKey as string | undefined, cohort: value.cohort as string | undefined, attributes };
}

function validateAttributes(value: unknown): Readonly<Record<string, string>> | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) return undefined;
  const entries = Object.entries(value);
  if (entries.length > 32 || entries.some(([name, field]) => name.trim() === "" || name.length > 128 || typeof field !== "string" || field.length > 1_024)) return undefined;
  return Object.freeze(Object.fromEntries(entries as [string, string][]));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function writeRejected(response: ServerResponse, status: number): void {
  writeJson(response, status, { error: "request rejected" });
}

function writeJson(response: ServerResponse, status: number, body: object): void {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

export function loadConfigFromEnv(environment: NodeJS.ProcessEnv): Required<RunnerConfig> {
  const serverUrl = environment.STRESS_SERVER_URL?.trim();
  const secretKey = environment.STRESS_SECRET_KEY?.trim();
  if (!serverUrl || !secretKey) throw new Error("STRESS_SERVER_URL and STRESS_SECRET_KEY are required");
  const parsedPort = parseNumber(environment.STRESS_NODE_PORT, DEFAULT_PORT, "STRESS_NODE_PORT", 1, 65_535);
  const timeout = parseNumber(environment.STRESS_HTTP_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, "STRESS_HTTP_TIMEOUT_MS", 1, 120_000);
  return normalizeAndValidate({
    serverUrl,
    secretKey,
    httpTimeoutMs: timeout,
    bindAddress: environment.STRESS_NODE_BIND?.trim() || DEFAULT_BIND_ADDRESS,
    port: parsedPort,
    allowNonLoopbackTarget: environment.ALLOW_NON_LOOPBACK_STRESS_TARGETS === "yes",
  });
}

function normalizeAndValidate(config: RunnerConfig): Required<RunnerConfig> {
  let url: URL;
  try {
    url = new URL(config.serverUrl);
  } catch {
    throw new Error("STRESS_SERVER_URL must be an absolute HTTP(S) URL without credentials");
  }
  if (!(["http:", "https:"].includes(url.protocol)) || url.username || url.password || !url.hostname || url.search || url.hash) throw new Error("STRESS_SERVER_URL must be an absolute HTTP(S) URL without credentials");
  if (!config.allowNonLoopbackTarget && !isLoopbackHost(url.hostname)) throw new Error("STRESS_SERVER_URL must not target a non-loopback host unless ALLOW_NON_LOOPBACK_STRESS_TARGETS=yes");
  if (!config.secretKey.startsWith("sk_")) throw new Error("STRESS_SECRET_KEY must be a valid secret key");
  if (!Number.isInteger(config.httpTimeoutMs) || config.httpTimeoutMs < 1 || config.httpTimeoutMs > 120_000) throw new Error("HTTP timeout must be between 1 and 120000");
  const bindAddress = config.bindAddress ?? DEFAULT_BIND_ADDRESS;
  if (bindAddress !== "127.0.0.1" && bindAddress !== "::1") throw new Error("stress runner bind address must be loopback");
  const port = config.port ?? DEFAULT_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("stress runner port must be between 1 and 65535");
  return { serverUrl: config.serverUrl, secretKey: config.secretKey, httpTimeoutMs: config.httpTimeoutMs, bindAddress, port, allowNonLoopbackTarget: config.allowNonLoopbackTarget ?? false };
}

function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

function parseNumber(value: string | undefined, defaultValue: number, name: string, minimum: number, maximum: number): number {
  if (value === undefined || value.trim() === "") return defaultValue;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  return parsed;
}
