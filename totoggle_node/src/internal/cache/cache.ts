import type { Path } from "../toggle/path.js";
import { Application } from "../toggle/application.js";
import type { Toggle } from "../toggle/toggle.js";

export interface CacheStats {
  readonly toggleCount: number;
  readonly lastSuccessAt: Date | null;
  readonly lastErrorAt: Date | null;
  readonly lastError: Error | null;
  readonly consecutiveFailures: number;
}

export interface CacheLookup {
  readonly target: Toggle;
  readonly ancestors: readonly Toggle[];
}

const EMPTY_STATS: CacheStats = {
  toggleCount: 0,
  lastSuccessAt: null,
  lastErrorAt: null,
  lastError: null,
  consecutiveFailures: 0,
};

/**
 * Holds the latest successfully fetched Application plus refresh health. A failed refresh is
 * recorded but never replaces the data a prior success stored — Node's single-threaded event
 * loop means no true data race, but interleaved async fetches must still never let a failure
 * blank out data a concurrent success just wrote.
 */
export class Cache {
  private app: Application = new Application([]);
  private currentStats: CacheStats = EMPTY_STATS;

  /** Replaces the cached Application after a successful fetch and resets the failure streak. */
  update(app: Application): void {
    this.app = app;
    this.currentStats = {
      ...this.currentStats,
      toggleCount: app.toggles.length,
      lastSuccessAt: new Date(),
      consecutiveFailures: 0,
    };
  }

  /** Tracks a failed refresh attempt without touching the cached data. */
  recordFailure(error: Error): void {
    this.currentStats = {
      ...this.currentStats,
      lastErrorAt: new Date(),
      lastError: error,
      consecutiveFailures: this.currentStats.consecutiveFailures + 1,
    };
  }

  /** The toggle at path plus every ancestor on the way down from the root, root first — null
   * only when the target itself was never fetched (a missing ancestor doesn't count). */
  get(path: Path): CacheLookup | null {
    const target = this.app.byPath(path);
    if (!target) {
      return null;
    }
    return { target, ancestors: this.app.ancestorsOf(path) };
  }

  stats(): CacheStats {
    return this.currentStats;
  }

  /** Discards all cached data and health stats, returning the Cache to its just-constructed
   * state. */
  clear(): void {
    this.app = new Application([]);
    this.currentStats = EMPTY_STATS;
  }
}
