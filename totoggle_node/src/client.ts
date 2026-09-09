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

export interface RefreshScheduler {
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
}

export interface ToToggleClientRuntime {
  /** Test seam for deterministic refresh health timestamps. */
  readonly now?: () => Date;
  /** Test seam for deterministic bounded refresh jitter. Must return a value in [0, 1). */
  readonly random?: () => number;
  /** Test seam for deterministic delayed background work. */
  readonly scheduler?: RefreshScheduler;
}

const DEFAULT_MAX_REFRESH_BACKOFF_MS = 60 * 60 * 1000;

/** The cache is considered stale once this many refresh intervals have passed with no
 * successful update — e.g. with the default 5-minute interval, no successful refresh in 10
 * minutes. Only actually reachable under enableOfflineMode, since otherwise a failing refresh
 * already surfaces loudly via isHealthy/lastError. */
const STALE_THRESHOLD_INTERVALS = 2;

function buildRegistry(timeZone: string | undefined): Registry {
  const registry = new Registry();

  const matchList = new MatchListEvaluator();
  registry.register("attribute", matchList);
  registry.register("user_id", matchList);
  registry.register("country", matchList);
  registry.register("cohort", matchList);

  registry.register("percentage", new PercentageEvaluator());
  registry.register("ip", new IpEvaluator());
  registry.register("time", new TimeWindowEvaluator(() => new Date(), timeZone));

  return registry;
}

/**
 * The ToToggle feature-flag client: fetches the toggle set for one application via a secret
 * key, caches it in memory, and evaluates isActive entirely from that cache — no
 * network access on the evaluation hot path.
 */
export class ToToggleClient {
  private readonly cache: Cache;
  private readonly registry: Registry;
  private readonly metrics = new MetricsDispatcher();
  private readonly apiUrl: string;

  private started = false;
  private shutdownFlag = false;
  private refreshTimer: unknown;
  private refreshInFlight: Promise<void> | undefined;
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly scheduler: RefreshScheduler;

  constructor(private readonly config: Config, runtime: ToToggleClientRuntime = {}) {
    this.apiUrl = toApiUrl(config);
    this.registry = buildRegistry(config.timeZone);
    this.now = runtime.now ?? (() => new Date());
    this.random = runtime.random ?? Math.random;
    this.scheduler = runtime.scheduler ?? {
      schedule: (callback, delayMs) => {
        const timer = setTimeout(callback, delayMs);
        timer.unref();
        return timer;
      },
      cancel: (handle) => clearTimeout(handle as NodeJS.Timeout),
    };
    this.cache = new Cache(this.now);
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

    this.scheduleRefresh();
  }

  private scheduleRefresh(): void {
    if (this.shutdownFlag || !this.started) return;
    if (this.refreshTimer !== undefined) this.scheduler.cancel(this.refreshTimer);
    this.refreshTimer = this.scheduler.schedule(() => {
      this.refreshTimer = undefined;
      void this.refreshOnce()
        .catch(() => {
          // The background loop records failures for observability but never propagates.
        })
        .finally(() => this.scheduleRefresh());
    }, this.nextRefreshDelay());
  }

  private nextRefreshDelay(): number {
    const failures = this.cache.stats().consecutiveFailures;
    if (failures === 0) return this.config.refreshIntervalMs;
    const maxDelay = Math.max(this.config.refreshIntervalMs, DEFAULT_MAX_REFRESH_BACKOFF_MS);
    const exponentialDelay = Math.min(
      maxDelay,
      this.config.refreshIntervalMs * 2 ** Math.min(failures - 1, 30),
    );
    const randomValue = this.random();
    const sampled = Number.isFinite(randomValue) ? randomValue : 0.5;
    return Math.max(1, Math.min(maxDelay, Math.floor(exponentialDelay * (0.5 + Math.max(0, Math.min(sampled, 0.999999))))));
  }

  private async refreshOnce(): Promise<void> {
    if (this.refreshInFlight !== undefined) return this.refreshInFlight;
    const refresh = this.performRefreshOnce();
    this.refreshInFlight = refresh;
    try {
      await refresh;
    } finally {
      if (this.refreshInFlight === refresh) this.refreshInFlight = undefined;
    }
  }

  private async performRefreshOnce(): Promise<void> {
    try {
      const result = await fetchToggles(
        this.apiUrl,
        this.config.secretKey,
        this.config.httpTimeoutMs,
        this.cache.catalog().etag,
      );
      if (this.shutdownFlag) {
        return;
      }
      if (result.status === "not-modified") {
        this.cache.markNotModified({ etag: result.etag });
      } else {
        this.cache.update(result.application, { etag: result.etag, revision: result.revision });
      }
      this.metrics.notifyRefreshSuccess(this.cache.stats().toggleCount);
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
    try {
      await this.refreshOnce();
    } finally {
      // A caller-triggered failure participates in the same retry policy as background work.
      // Replacing the pending timer avoids a fixed-rate retry racing a backed-off refresh.
      this.scheduleRefresh();
    }
  }

  /**
   * Reports whether the toggle at path is active. Rule inputs are resolved from the configured
   * request context rather than supplied by the caller.
   * Implements cascading validation: every ancestor on the path must be enabled. Activation
   * rules are intentionally local to the requested toggle and never cascade. A toggle that
   * doesn't exist, or a client that isn't started
   * (or has been shut down), fails closed to false.
   */
  isActive(path: string): boolean {
    return this.evaluate(path);
  }

  private evaluate(path: string): boolean {
    try {
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

    const result = this.ancestorsActive(lookup.ancestors) && lookup.target.enabled && this.ruleMatches(lookup.target);

    this.metrics.notifyEvaluation(path, result);
    return result;
    } catch (error) {
      console.warn(`totoggle: isActive(${path}) failed closed`, error);
      this.metrics.notifyEvaluation(path, false);
      return false;
    }
  }

  private ancestorsActive(ancestors: readonly Toggle[]): boolean {
    return ancestors.every((ancestor) => ancestor.enabled);
  }

  /** Reports whether toggle's activation rule matches, or true if it has none. A rule type with
   * no registered Evaluator (a server-added type this client predates) fails closed to false,
   * the same as every other malformed-rule case in this package. */
  private ruleMatches(toggle: Toggle): boolean {
    if (!toggle.hasActivationRule || !toggle.activationRule) {
      return true;
    }
    try {
      const key = this.keyForRule(toggle.activationRule, toggle.path.toString());
      if (key === undefined && toggle.activationRule.type !== "time") return false;
      return this.registry.evaluate(toggle.activationRule, key);
    } catch {
      return false;
    }
  }

  private keyForRule(rule: { type: string; config?: { context_key?: string } | null }, path?: string): string | undefined {
    const { type } = rule;
    const contextKey = rule.config?.context_key;
    if (!contextKey) return undefined;
    let raw: string | undefined;
    try {
      raw = this.config.contextResolver?.resolve(contextKey);
    } catch (error) {
      console.warn("totoggle: ToggleContextResolver failed; rule evaluation fails closed", error);
      return undefined;
    }
    const key = type === "percentage" && raw !== undefined ? `${path}:${raw}` : raw;
    if (type !== "time" && key === undefined) {
      console.warn(`totoggle: rule type "${type}" requires configured context key; evaluation fails closed`);
    }
    return key;
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
    return this.now().getTime() - stats.lastSuccessAt.getTime() > thresholdMs;
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
    if (this.refreshTimer !== undefined) {
      this.scheduler.cancel(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    this.cache.clear();
  }
}
