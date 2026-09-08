import type { ActivationRule } from "../toggle/rule.js";
import type { Evaluator } from "./strategy.js";

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** FNV-1a, 32-bit. Neither Node nor a zero-dependency environment exposes anything like Java's
 * JLS-specified String.hashCode(), so this is hand-written — a few lines, no dependency. */
function fnv1a(input: string): number {
  let hash = FNV_OFFSET_BASIS;
  // UTF-8 bytes make the result identical to the Go and JVM implementations.
  for (const byte of new TextEncoder().encode(input)) {
    hash ^= byte;
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
 * — now deliberately bit-identical across ToToggle SDKs. The supplied key includes the toggle
 * path, so two flags with the same percentage do not share an accidental cohort. Without a
 * rollout key, callers fail closed before reaching this evaluator.
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
