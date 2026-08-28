import { describe, expect, it } from "vitest";
import type { ActivationRule } from "../toggle/rule.js";
import { IpEvaluator } from "./ip.js";

describe("IpEvaluator", () => {
  const evaluator = new IpEvaluator();

  it("matches an exact IP in the allowlist", () => {
    const rule: ActivationRule = { type: "ip", value: "10.0.0.5,192.168.1.1" };
    expect(evaluator.evaluate(rule, "10.0.0.5")).toBe(true);
    expect(evaluator.evaluate(rule, "192.168.1.1")).toBe(true);
    expect(evaluator.evaluate(rule, "10.0.0.6")).toBe(false);
  });

  it("matches a CIDR range", () => {
    const rule: ActivationRule = { type: "ip", value: "10.0.0.0/24" };
    expect(evaluator.evaluate(rule, "10.0.0.1")).toBe(true);
    expect(evaluator.evaluate(rule, "10.0.0.254")).toBe(true);
    expect(evaluator.evaluate(rule, "10.0.1.1")).toBe(false);
  });

  it("matches mixed exact and CIDR entries", () => {
    const rule: ActivationRule = { type: "ip", value: "203.0.113.9, 10.0.0.0/24" };
    expect(evaluator.evaluate(rule, "203.0.113.9")).toBe(true);
    expect(evaluator.evaluate(rule, "10.0.0.42")).toBe(true);
    expect(evaluator.evaluate(rule, "203.0.113.10")).toBe(false);
  });

  it("never matches with no key", () => {
    const rule: ActivationRule = { type: "ip", value: "10.0.0.0/24" };
    expect(evaluator.evaluate(rule, undefined)).toBe(false);
  });

  it("never matches an unparseable candidate", () => {
    const rule: ActivationRule = { type: "ip", value: "10.0.0.0/24" };
    expect(evaluator.evaluate(rule, "not-an-ip")).toBe(false);
  });

  it("never matches a candidate with a non-numeric octet", () => {
    const rule: ActivationRule = { type: "ip", value: "10.0.0.0/24" };
    expect(evaluator.evaluate(rule, "10.0.0.abc")).toBe(false);
  });

  it("skips a malformed allowlist entry instead of failing the whole rule", () => {
    const rule: ActivationRule = { type: "ip", value: "not-a-cidr/99, 10.0.0.5" };
    expect(evaluator.evaluate(rule, "10.0.0.5")).toBe(true);
  });

  it("skips an out-of-range CIDR prefix length", () => {
    const rule: ActivationRule = { type: "ip", value: "10.0.0.0/33, 10.0.0.5" };
    expect(evaluator.evaluate(rule, "10.0.0.5")).toBe(true);
    expect(evaluator.evaluate(rule, "10.0.0.9")).toBe(false);
  });

  it("skips a non-integer CIDR prefix length", () => {
    const rule: ActivationRule = { type: "ip", value: "10.0.0.0/abc, 10.0.0.5" };
    expect(evaluator.evaluate(rule, "10.0.0.5")).toBe(true);
    expect(evaluator.evaluate(rule, "10.0.0.9")).toBe(false);
  });

  it("matches a CIDR range whose prefix length isn't a multiple of 8", () => {
    const rule: ActivationRule = { type: "ip", value: "10.0.16.0/20" };
    expect(evaluator.evaluate(rule, "10.0.16.5")).toBe(true);
    expect(evaluator.evaluate(rule, "10.0.31.254")).toBe(true);
    expect(evaluator.evaluate(rule, "10.0.32.1")).toBe(false);
  });

  it("never matches a blank rule value", () => {
    const rule: ActivationRule = { type: "ip", value: "" };
    expect(evaluator.evaluate(rule, "10.0.0.5")).toBe(false);
  });

  it("rejects an octet out of range", () => {
    const rule: ActivationRule = { type: "ip", value: "10.0.0.5" };
    expect(evaluator.evaluate(rule, "10.0.0.999")).toBe(false);
  });

  // IPv6 is out of scope — the confirmed prototype hint/placeholder only ever shows IPv4.
  it("never matches an IPv6 candidate", () => {
    const rule: ActivationRule = { type: "ip", value: "::1" };
    expect(evaluator.evaluate(rule, "::1")).toBe(false);
  });
});
