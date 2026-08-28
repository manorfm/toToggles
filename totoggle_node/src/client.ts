import { toApiUrl, type Config } from "./config.js";
import { MetricsDispatcher, type ToToggleMetricsListener } from "./metrics.js";
import { Cache, type CacheStats } from "./internal/cache/cache.js";
import { Path } from "./internal/toggle/path.js";
import type { Toggle } from "./internal/toggle/toggle.js";
import { fetchToggles } from "./internal/serverapi/fetch.js";
import { Registry } from "./internal/strategy/strategy.js";
import { MatchListEvaluator } from "./internal/strategy/matchlist.js";
import { PercentageEvaluator } from "./internal/strategy/percentage.js";
import { IpEvaluator } from "./internal/strategy/ip.js";
import { TimeWindowEvaluator } from "./internal/strategy/timewindow.js";

/** The cache is considered stale once this many refresh intervals have passed with no
 * successful update — e.g. with the default 5-minute interval, no successful refresh in 10
 * minutes. Only actually reachable under enableOfflineMode, since otherwise a failing refresh
 * already surfaces loudly via isHealthy/lastError. */
const STALE_THRESHOLD_INTERVALS = 2;

function buildRegistry(timeZone: string | undefined): Registry {
  const registry = new Registry();

  const matchList = new MatchListEvaluator();
  registry.register("parameter", matchList);
  registry.register("user_id", matchList);
  registry.register("country", matchList);
  registry.register("canary", matchList);

  registry.register("percentage", new PercentageEvaluator());
  registry.register("ip", new IpEvaluator());
  registry.register("time", new TimeWindowEvaluator(() => new Date(), timeZone));

  return registry;
}

/**
 * The ToToggle feature-flag client: fetches the toggle set for one application via a secret
 * key, caches it in memory, and evaluates isActive/isActiveFor entirely from that cache — no
 * network access on the evaluation hot path.
 */
export class ToToggleClient {
  private readonly cache = new Cache();
  private readonly registry: Registry;
  private readonly metrics = new MetricsDispatcher();
  private readonly apiUrl: string;

  private started = false;
  private shutdownFlag = false;
  private refreshTimer: NodeJS.Timeout | undefined;

  constructor(private readonly config: Config) {
    this.apiUrl = toApiUrl(config);
    this.registry = buildRegistry(config.timeZone);
  }

  /**
   * Performs the initial toggle fetch and begins the background refresh loop. A failed initial
   * fetch does not reject start() — the client comes up with an empty cache and reports itself
   * unhealthy (see isHealthy) until a refresh succeeds. Calling start() again after it already
   * succeeded is a no-op. Calling it after shutdown() rejects.
   */
  async start(): Promise<void> {
    if (this.shutdownFlag) {
      throw new Error("totoggle: client has been shut down and cannot be restarted");
    }
    if (this.started) {
      return;
    }
    this.started = true;

    await this.refreshOnce().catch(() => {
      // Start never fails on a bad initial fetch — see doc comment above.
    });

    if (this.shutdownFlag) {
      // shutdown() ran while the initial fetch was in flight — don't resurrect the background
      // loop it just stopped.
      return;
    }

    this.refreshTimer = setInterval(() => {
      void this.refreshOnce().catch(() => {
        // The background loop only records into cache.stats(); it never propagates.
      });
    }, this.config.refreshIntervalMs);
    this.refreshTimer.unref(); // don't keep the process alive just for this timer
  }

  private async refreshOnce(): Promise<void> {
    try {
      const app = await fetchToggles(this.apiUrl, this.config.secretKey, this.config.httpTimeoutMs);
      if (this.shutdownFlag) {
        return;
      }
      this.cache.update(app);
      this.metrics.notifyRefreshSuccess(app.toggles.length);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (!this.shutdownFlag) {
        this.cache.recordFailure(error);
        this.metrics.notifyRefreshFailure(error, this.cache.stats().consecutiveFailures);
      }
      throw error;
    }
  }

  /**
   * Forces an immediate fetch, bypassing the refresh interval, and rejects on failure — unlike
   * the background loop (which only records failures for the observability getters), a caller
   * explicitly asking for fresh data now gets a real answer.
   */
  async refresh(): Promise<void> {
    if (this.shutdownFlag) {
      throw new Error("totoggle: client has been shut down");
    }
    if (!this.started) {
      throw new Error("totoggle: client must be started before use");
    }
    await this.refreshOnce();
  }

  /**
   * Reports whether the toggle at path is active, with no parameter for rule evaluation.
   * Implements cascading validation: every ancestor on the path from root to target must be
   * enabled and pass its own activation rule (if any), then the target itself must be enabled
   * and pass its own rule (if any). A toggle that doesn't exist, or a client that isn't started
   * (or has been shut down), fails closed to false.
   */
  isActive(path: string): boolean {
    return this.evaluate(path, undefined);
  }

  /** isActive with a parameter forwarded to every activation rule in the cascade — the target's
   * own rule AND every ancestor's rule, not just the leaf's. */
  isActiveFor(path: string, parameter: string): boolean {
    return this.evaluate(path, parameter);
  }

  private evaluate(path: string, key: string | undefined): boolean {
    if (!this.started || this.shutdownFlag) {
      return false;
    }

    let parsedPath: Path;
    try {
      parsedPath = Path.parse(path);
    } catch {
      return false;
    }

    const lookup = this.cache.get(parsedPath);
    if (!lookup) {
      this.metrics.notifyEvaluation(path, false);
      return false;
    }

    const result =
      this.ancestorsActive(lookup.ancestors, key) &&
      lookup.target.enabled &&
      this.ruleMatches(lookup.target, key);

    this.metrics.notifyEvaluation(path, result);
    return result;
  }

  private ancestorsActive(ancestors: readonly Toggle[], key: string | undefined): boolean {
    return ancestors.every((ancestor) => ancestor.enabled && this.ruleMatches(ancestor, key));
  }

  /** Reports whether toggle's activation rule matches, or true if it has none. A rule type with
   * no registered Evaluator (a server-added type this client predates) fails closed to false,
   * the same as every other malformed-rule case in this package. */
  private ruleMatches(toggle: Toggle, key: string | undefined): boolean {
    if (!toggle.hasActivationRule || !toggle.activationRule) {
      return true;
    }
    try {
      return this.registry.evaluate(toggle.activationRule, key);
    } catch {
      return false;
    }
  }

  /** Whether the client is started, not shut down, has completed at least one successful
   * refresh, and that data isn't stale (see isStale). */
  isHealthy(): boolean {
    const stats = this.cache.stats();
    return this.started && !this.shutdownFlag && stats.lastSuccessAt !== null && !this.computeStale(stats);
  }

  /** Whether the cached data is older than expected — no successful refresh in more than
   * STALE_THRESHOLD_INTERVALS times the configured refresh interval, or no successful refresh
   * at all. */
  isStale(): boolean {
    return this.computeStale(this.cache.stats());
  }

  private computeStale(stats: CacheStats): boolean {
    if (stats.lastSuccessAt === null) {
      return true;
    }
    const thresholdMs = this.config.refreshIntervalMs * STALE_THRESHOLD_INTERVALS;
    return Date.now() - stats.lastSuccessAt.getTime() > thresholdMs;
  }

  /** The error from the most recent failed refresh, or null if there hasn't been one (yet). */
  lastError(): Error | null {
    return this.cache.stats().lastError;
  }

  /** When lastError last occurred, or null if there hasn't been one. */
  lastErrorTime(): Date | null {
    return this.cache.stats().lastErrorAt;
  }

  /** How many refresh attempts have failed in a row, reset to 0 on the next success. */
  consecutiveFailureCount(): number {
    return this.cache.stats().consecutiveFailures;
  }

  /** Registers listener under whichever ToToggleMetricsListener methods it implements. Safe to
   * call before or after start. */
  addMetricsListener(listener: ToToggleMetricsListener): void {
    this.metrics.add(listener);
  }

  /** Stops the background refresh loop and releases the cached data. Idempotent — a second call
   * is a no-op. Safe to call even if start was never called. A refresh already in flight when
   * shutdown is called is left to finish, but its result is discarded rather than applied. */
  shutdown(): void {
    if (this.shutdownFlag) {
      return;
    }
    this.shutdownFlag = true;
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    this.cache.clear();
  }
}
