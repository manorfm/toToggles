import { describe, expect, it } from "vitest";
import { createConfig, toApiUrl } from "./config.js";
import { TotoggleConfigError } from "./errors.js";

describe("createConfig", () => {
  it("applies defaults for a valid minimal config", () => {
    const cfg = createConfig("checkout-web", "https://toggles.example.com", "sk_abc123");

    expect(cfg.applicationName).toBe("checkout-web");
    expect(cfg.serverUrl).toBe("https://toggles.example.com");
    expect(cfg.secretKey).toBe("sk_abc123");
    expect(cfg.refreshIntervalMs).toBe(5 * 60 * 1000);
    expect(cfg.httpTimeoutMs).toBe(10 * 1000);
    expect(cfg.enableOfflineMode).toBe(true);
    expect(cfg.timeZone).toBeUndefined();
  });

  it("rejects a blank application name", () => {
    expect(() => createConfig("", "https://toggles.example.com", "sk_abc123")).toThrow(
      TotoggleConfigError,
    );
  });

  it("rejects a blank server URL", () => {
    expect(() => createConfig("app", "", "sk_abc123")).toThrow(TotoggleConfigError);
  });

  it("rejects a blank secret key", () => {
    expect(() => createConfig("app", "https://toggles.example.com", "")).toThrow(
      TotoggleConfigError,
    );
  });

  it("rejects a secret key without the sk_ prefix", () => {
    expect(() => createConfig("app", "https://toggles.example.com", "not-a-secret")).toThrow(
      TotoggleConfigError,
    );
  });

  it("accepts a custom refresh interval", () => {
    const cfg = createConfig("app", "https://toggles.example.com", "sk_abc123", {
      refreshIntervalMs: 30_000,
    });
    expect(cfg.refreshIntervalMs).toBe(30_000);
  });

  it("rejects a non-positive refresh interval", () => {
    expect(() =>
      createConfig("app", "https://toggles.example.com", "sk_abc123", { refreshIntervalMs: 0 }),
    ).toThrow(TotoggleConfigError);
  });

  it("accepts a custom HTTP timeout", () => {
    const cfg = createConfig("app", "https://toggles.example.com", "sk_abc123", {
      httpTimeoutMs: 2_000,
    });
    expect(cfg.httpTimeoutMs).toBe(2_000);
  });

  it("rejects a non-positive HTTP timeout", () => {
    expect(() =>
      createConfig("app", "https://toggles.example.com", "sk_abc123", { httpTimeoutMs: -1 }),
    ).toThrow(TotoggleConfigError);
  });

  it("accepts offline mode disabled", () => {
    const cfg = createConfig("app", "https://toggles.example.com", "sk_abc123", {
      enableOfflineMode: false,
    });
    expect(cfg.enableOfflineMode).toBe(false);
  });

  it("accepts a custom time zone", () => {
    const cfg = createConfig("app", "https://toggles.example.com", "sk_abc123", {
      timeZone: "America/Sao_Paulo",
    });
    expect(cfg.timeZone).toBe("America/Sao_Paulo");
  });
});

describe("toApiUrl", () => {
  it("appends /api/toggles to the server URL", () => {
    const cfg = createConfig("app", "https://toggles.example.com", "sk_abc123");
    expect(toApiUrl(cfg)).toBe("https://toggles.example.com/api/toggles");
  });

  it("strips a trailing slash before appending", () => {
    const cfg = createConfig("app", "https://toggles.example.com/", "sk_abc123");
    expect(toApiUrl(cfg)).toBe("https://toggles.example.com/api/toggles");
  });
});
