import { describe, expect, it } from "vitest";
import { NodeRequestContextResolver } from "./request-context.js";
import { IpEvaluator } from "../internal/strategy/ip.js";

function request(remoteAddress: string, headers: Record<string, string> = {}) {
  return { socket: { remoteAddress }, headers } as unknown as import("node:http").IncomingMessage;
}

describe("NodeRequestContextResolver", () => {
  it("uses the socket address and ignores spoofable forwarded headers by default", () => {
    const resolver = new NodeRequestContextResolver();
    resolver.run(request("::ffff:10.0.0.8", { "x-forwarded-for": "203.0.113.4", "cf-ipcountry": "BR" }), () => {
      expect(resolver.resolve("ip")).toBe("10.0.0.8");
      expect(resolver.resolve("country")).toBeUndefined();
    });
  });

  it("uses forwarded IP, country, and canonical domain values only from their owners", () => {
    const resolver = new NodeRequestContextResolver({
      trustedProxyAddresses: ["10.0.0.8"],
      values: () => ({ userId: "u-1", rolloutKey: "stable-user-1", cohort: "beta", attributes: { plan: "pro" } }),
    });
    resolver.run(request("10.0.0.8", { "x-forwarded-for": "203.0.113.4, 10.0.0.8", "cf-ipcountry": "br" }), () => {
      expect(resolver.resolve("ip")).toBe("203.0.113.4");
      expect(resolver.resolve("country")).toBe("BR");
      expect(resolver.resolve("user_id")).toBe("u-1");
      expect(resolver.resolve("rollout_key")).toBe("stable-user-1");
      expect(resolver.resolve("cohort")).toBe("beta");
      expect(resolver.resolve("attributes.plan")).toBe("pro");
    });
  });

  it("trusts forwarded headers for an IPv4 CIDR peer", () => {
    const resolver = new NodeRequestContextResolver({ trustedProxyAddresses: ["10.0.0.0/24"] });
    resolver.run(request("10.0.0.8", { "x-forwarded-for": "203.0.113.4" }), () => expect(resolver.resolve("ip")).toBe("203.0.113.4"));
  });

  it("uses RFC 7239 Forwarded only for a trusted peer", () => {
    const resolver = new NodeRequestContextResolver({ trustedProxyAddresses: ["10.0.0.8"] });
    resolver.run(request("10.0.0.8", { forwarded: "for=2001:db8::1" }), () => {
      expect(resolver.resolve("ip")).toBe("2001:db8::1");
      expect(new IpEvaluator().evaluate({ type: "ip", value: "2001:db8::/64" }, resolver.resolve("ip"))).toBe(true);
    });
  });

  it("supports an IPv6 trusted peer without trusting a different peer", () => {
    const resolver = new NodeRequestContextResolver({ trustedProxyAddresses: ["2001:db8::8"] });
    resolver.run(request("2001:db8::8", { forwarded: "for=2001:db8::1" }), () => expect(resolver.resolve("ip")).toBe("2001:db8::1"));
    resolver.run(request("2001:db8::9", { forwarded: "for=2001:db8::1" }), () => expect(resolver.resolve("ip")).toBe("2001:db8::9"));
  });

  it("trusts an IPv6 CIDR peer", () => {
    const resolver = new NodeRequestContextResolver({ trustedProxyAddresses: ["2001:db8::/32"] });
    resolver.run(request("2001:db8:1::8", { forwarded: "for=2001:db8::1" }), () => expect(resolver.resolve("ip")).toBe("2001:db8::1"));
  });

  it("uses an injected local country resolver for the socket address", () => {
    const resolver = new NodeRequestContextResolver({ countryResolver: (ip) => ip === "10.0.0.9" ? "br" : undefined });
    resolver.run(request("10.0.0.9"), () => expect(resolver.resolve("country")).toBe("BR"));
  });

  it("passes the effective forwarded client IP to the local country resolver", () => {
    let resolvedIp: string | undefined;
    const resolver = new NodeRequestContextResolver({
      trustedProxyAddresses: ["10.0.0.8"],
      countryResolver: (ip) => { resolvedIp = ip; return "br"; },
    });

    resolver.run(request("10.0.0.8", { "x-forwarded-for": "203.0.113.4" }), () => {
      expect(resolver.resolve("ip")).toBe("203.0.113.4");
      expect(resolver.resolve("country")).toBe("BR");
    });
    expect(resolvedIp).toBe("203.0.113.4");
  });

  it("prefers a valid trusted country header over the local resolver", () => {
    const resolver = new NodeRequestContextResolver({
      trustedProxyAddresses: ["10.0.0.8"],
      countryResolver: () => "us",
    });
    resolver.run(request("10.0.0.8", { "cf-ipcountry": "br" }), () => expect(resolver.resolve("country")).toBe("BR"));
  });

  it("falls back to local country resolution when a trusted country header is malformed", () => {
    const resolver = new NodeRequestContextResolver({
      trustedProxyAddresses: ["10.0.0.8"],
      countryResolver: () => "br",
    });
    resolver.run(request("10.0.0.8", { "cf-ipcountry": "not-a-country" }), () => expect(resolver.resolve("country")).toBe("BR"));
  });

  it("fails closed when the local country resolver fails or returns an invalid country", () => {
    const throwingResolver = new NodeRequestContextResolver({ countryResolver: () => { throw new Error("GeoIP unavailable"); } });
    throwingResolver.run(request("10.0.0.8"), () => expect(throwingResolver.resolve("country")).toBeUndefined());

    const invalidResolver = new NodeRequestContextResolver({ countryResolver: () => "BRA" });
    invalidResolver.run(request("10.0.0.8"), () => expect(invalidResolver.resolve("country")).toBeUndefined());
  });

  it("does not allow domain values to override network-derived context", () => {
    const resolver = new NodeRequestContextResolver({
      values: () => ({ ip: "203.0.113.99", country: "BR", userId: "u-1" } as unknown as import("./request-context.js").NodeDomainContextValues),
    });
    resolver.run(request("10.0.0.8"), () => {
      expect(resolver.resolve("ip")).toBe("10.0.0.8");
      expect(resolver.resolve("country")).toBeUndefined();
      expect(resolver.resolve("user_id")).toBe("u-1");
    });
  });

  it("fails closed for blank canonical values and malformed attribute maps", () => {
    const resolver = new NodeRequestContextResolver({
      values: () => ({
        userId: " ",
        rolloutKey: "",
        cohort: "\t",
        attributes: ["not-an-attribute-map"] as unknown as Record<string, string>,
      }),
    });

    resolver.run(request("10.0.0.8"), () => {
      expect(resolver.resolve("user_id")).toBeUndefined();
      expect(resolver.resolve("rollout_key")).toBeUndefined();
      expect(resolver.resolve("cohort")).toBeUndefined();
      expect(resolver.resolve("attributes.0")).toBeUndefined();
    });
  });

  it("makes request context available through middleware", () => {
    const resolver = new NodeRequestContextResolver();
    resolver.expressMiddleware()(request("10.0.0.8"), undefined, () => {
      expect(resolver.resolve("ip")).toBe("10.0.0.8");
    });
  });

  it("keeps canonical domain values isolated across overlapping asynchronous requests", async () => {
    const resolver = new NodeRequestContextResolver({
      values: (incoming) => ({
        userId: incoming.headers["x-user-id"] as string | undefined,
        rolloutKey: incoming.headers["x-rollout-key"] as string | undefined,
        cohort: incoming.headers["x-cohort"] as string | undefined,
        attributes: { plan: incoming.headers["x-plan"] as string | undefined },
      }),
    });

    const first = resolver.run(request("10.0.0.8", {
      "x-user-id": "user-a", "x-rollout-key": "rollout-a", "x-cohort": "beta", "x-plan": "pro",
    }), async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(resolver.resolve("user_id")).toBe("user-a");
      expect(resolver.resolve("rollout_key")).toBe("rollout-a");
      expect(resolver.resolve("cohort")).toBe("beta");
      expect(resolver.resolve("attributes.plan")).toBe("pro");
      expect(resolver.resolve("ip")).toBe("10.0.0.8");
    });
    const second = resolver.run(request("10.0.0.9", {
      "x-user-id": "user-b", "x-rollout-key": "rollout-b", "x-cohort": "stable", "x-plan": "free",
    }), async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(resolver.resolve("user_id")).toBe("user-b");
      expect(resolver.resolve("rollout_key")).toBe("rollout-b");
      expect(resolver.resolve("cohort")).toBe("stable");
      expect(resolver.resolve("attributes.plan")).toBe("free");
      expect(resolver.resolve("ip")).toBe("10.0.0.9");
    });

    await Promise.all([first, second]);
    expect(resolver.resolve("user_id")).toBeUndefined();
  });

  it("binds Fastify's raw Node request through its onRequest hook", async () => {
    const resolver = new NodeRequestContextResolver({ values: () => ({ userId: "u-1" }) });
    let continuation: Promise<void> | undefined;
    resolver.fastifyOnRequest()({ raw: request("10.0.0.8") }, undefined, () => {
      continuation = new Promise((resolve) => setImmediate(() => {
        expect(resolver.resolve("ip")).toBe("10.0.0.8");
        expect(resolver.resolve("user_id")).toBe("u-1");
        resolve();
      }));
    });
    expect(continuation).toBeDefined();
    await continuation;
  });
});
