import { TotoggleConfigError } from "./errors.js";

const DEFAULT_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_HTTP_TIMEOUT_MS = 10 * 1000;
const DEFAULT_ENABLE_OFFLINE_MODE = true;

export interface ConfigOptions {
  /** How often to re-fetch toggles from the server. Default: 5 minutes. */
  refreshIntervalMs?: number;
  /** Timeout for a single fetch request. Default: 10 seconds. */
  httpTimeoutMs?: number;
  /** Keep serving the last successfully fetched data when the server becomes unreachable
   * (true, the default) instead of being treated as unhealthy immediately on a failed refresh. */
  enableOfflineMode?: boolean;
  /** IANA zone "time" activation rules ("09:00-18:00" windows) are evaluated in. Default: the
   * runtime's own zone. The rule is documented as "24h window in server timezone" — a client has
   * no way to know the server's zone on its own, so this should be set explicitly when it
   * differs. */
  timeZone?: string;
}

/** Validated client configuration. Build one with createConfig — there is no setter API, so a
 * Config handed to the Client is exactly what validation checked. */
export interface Config {
  readonly applicationName: string;
  readonly serverUrl: string;
  readonly secretKey: string;
  readonly refreshIntervalMs: number;
  readonly httpTimeoutMs: number;
  readonly enableOfflineMode: boolean;
  readonly timeZone?: string;
}

/** Validates and builds a Config. secretKey must start with "sk_" — that prefix is how the
 * server identifies its own issued keys. Throws TotoggleConfigError on anything invalid. */
export function createConfig(
  applicationName: string,
  serverUrl: string,
  secretKey: string,
  options: ConfigOptions = {},
): Config {
  if (applicationName.trim() === "") {
    throw new TotoggleConfigError("application name must not be blank");
  }
  if (serverUrl.trim() === "") {
    throw new TotoggleConfigError("server URL must not be blank");
  }
  if (secretKey.trim() === "") {
    throw new TotoggleConfigError("secret key must not be blank");
  }
  if (!secretKey.startsWith("sk_")) {
    throw new TotoggleConfigError('secret key must start with "sk_"');
  }

  const refreshIntervalMs = options.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS;
  if (refreshIntervalMs <= 0) {
    throw new TotoggleConfigError("refresh interval must be positive");
  }

  const httpTimeoutMs = options.httpTimeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS;
  if (httpTimeoutMs <= 0) {
    throw new TotoggleConfigError("HTTP timeout must be positive");
  }

  return {
    applicationName,
    serverUrl,
    secretKey,
    refreshIntervalMs,
    httpTimeoutMs,
    enableOfflineMode: options.enableOfflineMode ?? DEFAULT_ENABLE_OFFLINE_MODE,
    timeZone: options.timeZone,
  };
}

/** The full toggles endpoint derived from serverUrl. */
export function toApiUrl(config: Config): string {
  return config.serverUrl.replace(/\/+$/, "") + "/api/toggles";
}
