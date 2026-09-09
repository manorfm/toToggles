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

export interface CatalogVersion {
  readonly etag?: string;
  readonly revision?: string;
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
  private currentCatalog: CatalogVersion = {};

  constructor(private readonly now: () => Date = () => new Date()) {}

  /** Replaces the cached Application after a successful fetch and resets the failure streak. */
  update(app: Application, catalog: CatalogVersion = {}): void {
    this.app = app;
    this.currentCatalog = catalog;
    this.currentStats = {
      ...this.currentStats,
      toggleCount: app.toggles.length,
      lastSuccessAt: this.now(),
      consecutiveFailures: 0,
    };
  }

  /** Records a successful conditional fetch without disturbing the known-good snapshot. */
  markNotModified(catalog: Pick<CatalogVersion, "etag"> = {}): void {
    if (this.currentStats.lastSuccessAt === null) {
      throw new Error("totoggle: received 304 before an initial catalog snapshot");
    }
    if (catalog.etag !== undefined) {
      this.currentCatalog = { ...this.currentCatalog, etag: catalog.etag };
    }
    this.currentStats = {
      ...this.currentStats,
      lastSuccessAt: this.now(),
      consecutiveFailures: 0,
    };
  }

  /** Tracks a failed refresh attempt without touching the cached data. */
  recordFailure(error: Error): void {
    this.currentStats = {
      ...this.currentStats,
      lastErrorAt: this.now(),
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

  /** The HTTP validator and optional server revision for the current snapshot. */
  catalog(): CatalogVersion {
    return this.currentCatalog;
  }

  /** Discards all cached data and health stats, returning the Cache to its just-constructed
   * state. */
  clear(): void {
    this.app = new Application([]);
    this.currentStats = EMPTY_STATS;
    this.currentCatalog = {};
  }
}
