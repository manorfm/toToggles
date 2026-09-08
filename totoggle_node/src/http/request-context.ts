import { AsyncLocalStorage } from "node:async_hooks";
import type { IncomingMessage } from "node:http";
import type { ToggleContextResolver } from "../context.js";

export interface NodeRequestContextOptions {
  /** Exact peer addresses allowed to supply forwarded IP and country headers. Empty by default. */
  readonly trustedProxyAddresses?: readonly string[];
  /** Country header emitted by a trusted edge. It is ignored for untrusted peers. */
  readonly countryHeader?: string;
  /** Domain-owned values such as user_id, rollout_key, cohort and attributes.*. */
  readonly values?: (request: IncomingMessage) => Readonly<Record<string, string | undefined>>;
}

/** Request-local resolver for Node HTTP servers. Use run() in middleware before calling isActive. */
export class NodeRequestContextResolver implements ToggleContextResolver {
  private readonly storage = new AsyncLocalStorage<ReadonlyMap<string, string>>();
  private readonly trustedPeers: ReadonlySet<string>;
  private readonly countryHeader: string;

  constructor(private readonly options: NodeRequestContextOptions = {}) {
    this.trustedPeers = new Set(options.trustedProxyAddresses ?? []);
    this.countryHeader = (options.countryHeader ?? "cf-ipcountry").toLowerCase();
  }

  run<T>(request: IncomingMessage, callback: () => T): T {
    return this.storage.run(this.valuesFor(request), callback);
  }

  resolve(contextKey: string): string | undefined {
    return this.storage.getStore()?.get(contextKey);
  }

  private valuesFor(request: IncomingMessage): ReadonlyMap<string, string> {
    const remote = normalizeAddress(request.socket.remoteAddress);
    const trusted = remote !== undefined && this.trustedPeers.has(remote);
    const values = new Map<string, string>();
    if (remote) values.set("ip", remote);
    if (trusted) {
      const forwardedHeader = request.headers["x-forwarded-for"];
      const forwarded = firstForwardedAddress(Array.isArray(forwardedHeader) ? forwardedHeader[0] : forwardedHeader);
      if (forwarded) values.set("ip", forwarded);
      const country = request.headers[this.countryHeader];
      const countryValue = Array.isArray(country) ? country[0] : country;
      if (countryValue && /^[A-Za-z]{2}$/.test(countryValue.trim())) values.set("country", countryValue.trim().toUpperCase());
    }
    for (const [key, value] of Object.entries(this.options.values?.(request) ?? {})) {
      if (value !== undefined && value !== "") values.set(key, value);
    }
    return values;
  }
}

function firstForwardedAddress(value: string | undefined): string | undefined {
  return value?.split(",", 1)[0]?.trim() || undefined;
}

function normalizeAddress(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.startsWith("::ffff:") ? value.slice(7) : value;
}
