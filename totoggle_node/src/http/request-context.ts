import { AsyncLocalStorage } from "node:async_hooks";
import type { IncomingMessage } from "node:http";
import { isIP } from "node:net";
import type { ToggleContextResolver } from "../context.js";

export interface NodeRequestContextOptions {
  /** Exact peer addresses allowed to supply forwarded IP and country headers. Empty by default. */
  readonly trustedProxyAddresses?: readonly string[];
  /** Country header emitted by a trusted edge. It is ignored for untrusted peers. */
  readonly countryHeader?: string;
  /**
   * Optional local GeoIP resolver. It receives the effective client IP: the socket peer by
   * default, or a validated forwarded IP when that peer is trusted. It is never called for a
   * trusted, valid country header.
   */
  readonly countryResolver?: (ip: string) => string | undefined;
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

  /** Express/Fastify-compatible middleware: req must be a Node IncomingMessage shape. */
  middleware() {
    return (request: IncomingMessage, _response: unknown, next: () => void): void => {
      this.run(request, next);
    };
  }

  resolve(contextKey: string): string | undefined {
    return this.storage.getStore()?.get(contextKey);
  }

  private valuesFor(request: IncomingMessage): ReadonlyMap<string, string> {
    const remote = normalizeAddress(request.socket.remoteAddress);
    const trusted = remote !== undefined && isTrustedPeer(remote, this.trustedPeers);
    const values = new Map<string, string>();
    const forwarded = trusted ? firstForwardedAddress(request.headers) : undefined;
    const clientIp = forwarded && isIP(forwarded) !== 0 ? forwarded : remote;

    if (clientIp) values.set("ip", clientIp);
    if (trusted) {
      const country = normalizeCountry(headerValue(request.headers[this.countryHeader]));
      if (country) values.set("country", country);
    }

    if (!values.has("country")) {
      const country = clientIp ? resolveCountry(this.options.countryResolver, clientIp) : undefined;
      if (country) values.set("country", country);
    }

    for (const [key, value] of Object.entries(domainValues(this.options.values, request))) {
      if (key === "ip" || key === "country") continue;
      if (value !== undefined && value !== "") values.set(key, value);
    }
    return values;
  }
}

function firstForwardedAddress(headers: IncomingMessage["headers"]): string | undefined {
  const forwarded = headerValue(headers.forwarded);
  const first = forwarded?.split(",", 1)[0]?.trim();
  const match = /^for=(.+?)(?:;.*)?$/i.exec(first ?? "");
  const rfc7239Address = match?.[1]?.trim().replace(/^"|"$/g, "").replace(/^\[|\]$/g, "");
  return rfc7239Address || headerValue(headers["x-forwarded-for"])?.split(",", 1)[0]?.trim() || undefined;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeCountry(value: string | undefined): string | undefined {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z]{2}$/.test(normalized) ? normalized : undefined;
}

function resolveCountry(resolver: NodeRequestContextOptions["countryResolver"], ip: string): string | undefined {
  try {
    return normalizeCountry(resolver?.(ip));
  } catch {
    return undefined;
  }
}

function domainValues(values: NodeRequestContextOptions["values"], request: IncomingMessage): Readonly<Record<string, string | undefined>> {
  try {
    return values?.(request) ?? {};
  } catch {
    return {};
  }
}

function normalizeAddress(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.startsWith("::ffff:") ? value.slice(7) : value;
  return isIP(normalized) === 0 ? undefined : normalized;
}

function isTrustedPeer(address: string, peers: ReadonlySet<string>): boolean {
  for (const peer of peers) {
    if (peer === address) return true;
    const [network, prefix] = peer.split("/");
    if (prefix !== undefined && matchesIpv4Cidr(address, network, Number(prefix))) return true;
    if (prefix !== undefined && matchesIpv6Cidr(address, network, Number(prefix))) return true;
  }
  return false;
}

function matchesIpv6Cidr(address: string, network: string | undefined, prefix: number): boolean {
  const parse = (value: string | undefined): bigint | undefined => {
    if (!value || isIP(value) !== 6) return undefined;
    const [left, right = ""] = value.split("::");
    const leftParts = left ? left.split(":") : []; const rightParts = right ? right.split(":") : [];
    const parts = [...leftParts, ...Array(8 - leftParts.length - rightParts.length).fill("0"), ...rightParts];
    return parts.reduce((result, part) => (result << 16n) | BigInt(parseInt(part || "0", 16)), 0n);
  };
  const candidate = parse(address); const base = parse(network);
  if (candidate === undefined || base === undefined || !Number.isInteger(prefix) || prefix < 0 || prefix > 128) return false;
  const mask = prefix === 0 ? 0n : ((1n << BigInt(prefix)) - 1n) << BigInt(128 - prefix);
  return (candidate & mask) === (base & mask);
}

function matchesIpv4Cidr(address: string, network: string | undefined, prefix: number): boolean {
  const parse = (value: string | undefined) => value?.split(".").length === 4 ? value.split(".").reduce<number | undefined>((acc, part) => acc === undefined || !/^\d+$/.test(part) || Number(part) > 255 ? undefined : (acc << 8) | Number(part), 0) : undefined;
  const candidate = parse(address); const base = parse(network);
  if (candidate === undefined || base === undefined || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const mask = prefix === 0 ? 0 : (-1 << (32 - prefix));
  return (candidate & mask) === (base & mask);
}
