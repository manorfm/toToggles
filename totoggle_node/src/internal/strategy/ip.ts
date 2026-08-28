import type { ActivationRule } from "../toggle/rule.js";
import type { Evaluator } from "./strategy.js";

/** Parses a dotted-quad IPv4 literal into 4 octets (0-255), or null if it isn't one. Hand-written
 * (no dependency) so a malformed or hostname-shaped candidate can never trigger a DNS lookup. */
function parseIpv4(value: string): number[] | null {
  const parts = value.trim().split(".");
  if (parts.length !== 4) {
    return null;
  }
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return null;
    }
    const octet = Number(part);
    if (octet < 0 || octet > 255) {
      return null;
    }
    octets.push(octet);
  }
  return octets;
}

function isInCidrRange(candidate: number[], network: number[], prefixLength: number): boolean {
  const fullOctets = Math.floor(prefixLength / 8);
  const remainingBits = prefixLength % 8;

  for (let i = 0; i < fullOctets; i++) {
    if (candidate[i] !== network[i]) {
      return false;
    }
  }
  if (remainingBits > 0) {
    const mask = (0xff << (8 - remainingBits)) & 0xff;
    if ((candidate[fullOctets]! & mask) !== (network[fullOctets]! & mask)) {
      return false;
    }
  }
  return true;
}

function matchesEntry(entry: string, candidate: number[]): boolean {
  if (entry.includes("/")) {
    const [networkRaw, prefixRaw] = entry.split("/", 2);
    const network = parseIpv4(networkRaw!);
    if (!network) {
      return false;
    }
    const prefixLength = Number(prefixRaw);
    if (!Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > 32) {
      return false;
    }
    return isInCidrRange(candidate, network, prefixLength);
  }
  const exact = parseIpv4(entry);
  return exact !== null && exact.every((octet, i) => octet === candidate[i]);
}

/**
 * Matches a candidate IPv4 address against a comma-separated allowlist of exact addresses and/or
 * CIDR ranges (e.g. "10.0.0.0/24"). IPv4 only, per the confirmed prototype placeholder/hint.
 */
export class IpEvaluator implements Evaluator {
  evaluate(rule: ActivationRule, key: string | undefined): boolean {
    if (key === undefined || rule.value.trim() === "") {
      return false;
    }

    const candidate = parseIpv4(key);
    if (!candidate) {
      return false;
    }

    return rule.value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry !== "")
      .some((entry) => matchesEntry(entry, candidate));
  }
}
