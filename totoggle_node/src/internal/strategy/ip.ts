import type { ActivationRule } from "../toggle/rule.js";
import type { Evaluator } from "./strategy.js";

type IpAddress = Readonly<{ family: 4 | 6; bytes: readonly number[] }>;

/** Parses a dotted-quad IPv4 literal without invoking DNS. */
function parseIpv4(value: string): number[] | null {
  const parts = value.trim().split(".");
  if (parts.length !== 4) return null;

  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    octets.push(octet);
  }
  return octets;
}

/** Parses an RFC 4291 IPv6 literal, including a final embedded IPv4 literal, without DNS. */
function parseIpv6(value: string): number[] | null {
  const input = value.trim();
  if (input === "" || input.includes("%") || (input.match(/::/g)?.length ?? 0) > 1) return null;

  const parseSide = (side: string): number[] | null => {
    if (side === "") return [];
    const groups = side.split(":");
    const parsed: number[] = [];
    for (let index = 0; index < groups.length; index++) {
      const group = groups[index]!;
      if (group.includes(".")) {
        if (index !== groups.length - 1) return null;
        const ipv4 = parseIpv4(group);
        if (!ipv4) return null;
        parsed.push((ipv4[0]! << 8) | ipv4[1]!, (ipv4[2]! << 8) | ipv4[3]!);
      } else {
        if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
        parsed.push(Number.parseInt(group, 16));
      }
    }
    return parsed;
  };

  const compressed = input.includes("::");
  const [leftRaw, rightRaw = ""] = input.split("::", 2);
  const left = parseSide(leftRaw!);
  const right = compressed ? parseSide(rightRaw) : [];
  if (!left || !right) return null;

  const omitted = 8 - left.length - right.length;
  if ((compressed && omitted < 1) || (!compressed && left.length !== 8)) return null;
  const groups = compressed ? [...left, ...Array<number>(omitted).fill(0), ...right] : left;
  if (groups.length !== 8) return null;

  return groups.flatMap((group) => [(group >>> 8) & 0xff, group & 0xff]);
}

function parseIp(value: string): IpAddress | null {
  const ipv4 = parseIpv4(value);
  if (ipv4) return { family: 4, bytes: ipv4 };
  const ipv6 = parseIpv6(value);
  return ipv6 ? { family: 6, bytes: ipv6 } : null;
}

function isInCidrRange(candidate: IpAddress, network: IpAddress, prefixLength: number): boolean {
  if (candidate.family !== network.family) return false;
  const fullBytes = Math.floor(prefixLength / 8);
  const remainingBits = prefixLength % 8;
  for (let index = 0; index < fullBytes; index++) {
    if (candidate.bytes[index] !== network.bytes[index]) return false;
  }
  if (remainingBits > 0) {
    const mask = (0xff << (8 - remainingBits)) & 0xff;
    return (candidate.bytes[fullBytes]! & mask) === (network.bytes[fullBytes]! & mask);
  }
  return true;
}

function matchesEntry(entry: string, candidate: IpAddress): boolean {
  if (entry.includes("/")) {
    const [networkRaw, prefixRaw, extra] = entry.split("/");
    if (extra !== undefined || prefixRaw === undefined || !/^\d+$/.test(prefixRaw.trim())) return false;
    const network = parseIp(networkRaw!);
    if (!network) return false;
    const prefixLength = Number(prefixRaw.trim());
    const maximumPrefix = network.family === 4 ? 32 : 128;
    return prefixLength <= maximumPrefix && isInCidrRange(candidate, network, prefixLength);
  }
  const exact = parseIp(entry);
  return exact !== null && exact.family === candidate.family && exact.bytes.every((byte, index) => byte === candidate.bytes[index]);
}

/**
 * Matches a candidate IPv4 or IPv6 literal against a comma-separated allowlist of exact
 * addresses and/or CIDR ranges. Parsing is local and never turns a hostname into a DNS lookup.
 */
export class IpEvaluator implements Evaluator {
  evaluate(rule: ActivationRule, key: string | undefined): boolean {
    if (key === undefined || rule.value.trim() === "") return false;
    const candidate = parseIp(key);
    if (!candidate) return false;

    return rule.value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry !== "")
      .some((entry) => matchesEntry(entry, candidate));
  }
}
