import { describe, expect, it } from "vitest";
import { NodeRequestContextResolver } from "./request-context.js";

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

  it("uses forwarded IP and country only from an explicitly trusted peer", () => {
    const resolver = new NodeRequestContextResolver({ trustedProxyAddresses: ["10.0.0.8"], values: () => ({ user_id: "u-1", "attributes.plan": "pro" }) });
    resolver.run(request("10.0.0.8", { "x-forwarded-for": "203.0.113.4, 10.0.0.8", "cf-ipcountry": "br" }), () => {
      expect(resolver.resolve("ip")).toBe("203.0.113.4");
      expect(resolver.resolve("country")).toBe("BR");
      expect(resolver.resolve("attributes.plan")).toBe("pro");
    });
  });

  it("trusts forwarded headers for an IPv4 CIDR peer", () => {
    const resolver = new NodeRequestContextResolver({ trustedProxyAddresses: ["10.0.0.0/24"] });
    resolver.run(request("10.0.0.8", { "x-forwarded-for": "203.0.113.4" }), () => expect(resolver.resolve("ip")).toBe("203.0.113.4"));
  });

  it("uses RFC 7239 Forwarded only for a trusted peer", () => {
    const resolver = new NodeRequestContextResolver({ trustedProxyAddresses: ["10.0.0.8"] });
    resolver.run(request("10.0.0.8", { forwarded: "for=2001:db8::1" }), () => expect(resolver.resolve("ip")).toBe("2001:db8::1"));
  });

  it("makes request context available through middleware", () => {
    const resolver = new NodeRequestContextResolver();
    resolver.middleware()(request("10.0.0.8"), undefined, () => {
      expect(resolver.resolve("ip")).toBe("10.0.0.8");
    });
  });
});
