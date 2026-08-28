import type { ActivationRule } from "../toggle/rule.js";
import type { Evaluator } from "./strategy.js";

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** FNV-1a, 32-bit. Neither Node nor a zero-dependency environment exposes anything like Java's
 * JLS-specified String.hashCode(), so this is hand-written — a few lines, no dependency. */
function fnv1a(input: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

/** A deterministic value in [0, 100) derived from ruleValue+key. */
function consistentBucket(ruleValue: string, key: string): number {
  const hash = fnv1a(`${ruleValue}:${key}`);
  return (hash % 10000) / 100;
}

const PLAIN_DECIMAL = /^-?\d+(\.\d+)?$/;

function parsePercentage(raw: string): number | null {
  const trimmed = raw.trim();
  if (!PLAIN_DECIMAL.test(trimmed)) {
    return null;
  }
  return Number(trimmed);
}

/**
 * Activates a configured percentage of evaluations. With a key (a stable per-user/session
 * identifier), the bucket is deterministic — the same key + rule value always lands in the same
 * bucket. This is deliberately not bit-identical to totoggle_java's or totoggle_go's bucketing
 * (neither Java's String.hashCode() nor Go's FNV-1a-via-hash/fnv is replicated bit-for-bit here)
 * — "same user always gets the same result" only requires self-consistency within one client,
 * not cross-language identity. With no key, there is nothing to be consistent with, so it falls
 * back to a per-call random draw.
 */
export class PercentageEvaluator implements Evaluator {
  constructor(private readonly randomSource: () => number = Math.random) {}

  evaluate(rule: ActivationRule, key: string | undefined): boolean {
    const percentage = parsePercentage(rule.value);
    if (percentage === null || percentage < 0 || percentage > 100) {
      return false;
    }

    const bucket = key !== undefined ? consistentBucket(rule.value, key) : this.randomSource() * 100;
    return bucket < percentage;
  }
}
