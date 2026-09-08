import { AsyncLocalStorage } from "node:async_hooks";
import type { IncomingMessage } from "node:http";
import { isIP } from "node:net";
import type { ToggleContextResolver } from "../context.js";

export interface NodeRequestContextOptions {
  /** Exact peer addresses allowed to supply forwarded IP and country headers. Empty by default. */
  readonly trustedProxyAddresses?: readonly string[];
  /** Country header emitted by a trusted edge. It is ignored for untrusted peers. */
  readonly countryHeader?: string;
  /** Optional local GeoIP resolver; called only when a trusted country header is unavailable. */
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
    if (remote) values.set("ip", remote);
    if (trusted) {
      const forwardedHeader = request.headers["forwarded"];
      const forwarded = firstForwardedAddress(Array.isArray(forwardedHeader) ? forwardedHeader[0] : forwardedHeader)
        ?? firstForwardedAddress(Array.isArray(request.headers["x-forwarded-for"]) ? request.headers["x-forwarded-for"][0] : request.headers["x-forwarded-for"]);
      if (forwarded && isIP(forwarded) !== 0) values.set("ip", forwarded);
      const country = request.headers[this.countryHeader];
      const countryValue = Array.isArray(country) ? country[0] : country;
      const resolvedCountry = countryValue ?? (remote ? this.options.countryResolver?.(remote) : undefined);
      if (resolvedCountry && /^[A-Za-z]{2}$/.test(resolvedCountry.trim())) values.set("country", resolvedCountry.trim().toUpperCase());
    }
    for (const [key, value] of Object.entries(this.options.values?.(request) ?? {})) {
      if (value !== undefined && value !== "") values.set(key, value);
    }
    return values;
  }
}

function firstForwardedAddress(value: string | undefined): string | undefined {
  const first = value?.split(",", 1)[0]?.trim();
  const match = /^for=(.+?)(?:;.*)?$/i.exec(first ?? "");
  return (match?.[1]?.trim().replace(/^"|"$/g, "").replace(/^\[|\]$/g, "") ?? first) || undefined;
}

function normalizeAddress(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.startsWith("::ffff:") ? value.slice(7) : value;
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
