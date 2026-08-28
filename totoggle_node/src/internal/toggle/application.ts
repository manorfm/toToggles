import type { Path } from "./path.js";
import type { Toggle } from "./toggle.js";

/**
 * The full set of toggles fetched for one application, indexed for O(1) path lookup. Owns the
 * path-cascade logic (ancestorsOf) once, instead of each caller (cache, client) walking segments
 * itself.
 */
export class Application {
  readonly toggles: readonly Toggle[];
  private readonly byPathIndex: Map<string, Toggle>;

  constructor(toggles: readonly Toggle[]) {
    this.toggles = toggles;
    this.byPathIndex = new Map(toggles.map((t) => [t.path.toString(), t]));
  }

  /** Looks up the toggle at an exact path. */
  byPath(path: Path): Toggle | undefined {
    return this.byPathIndex.get(path.toString());
  }

  /** Every toggle on the path from root to (but not including) path that is present in this
   * Application, root first. An ancestor segment that was never fetched is skipped rather than
   * treated as an error. */
  ancestorsOf(path: Path): Toggle[] {
    const ancestors: Toggle[] = [];
    for (const ancestorPath of path.ancestorPaths()) {
      const toggle = this.byPathIndex.get(ancestorPath.toString());
      if (toggle) {
        ancestors.push(toggle);
      }
    }
    return ancestors;
  }
}
