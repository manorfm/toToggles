/**
 * A validated, dot-separated toggle path (e.g. "service.feature.flag"). Never empty and never
 * has an empty segment — those are the only two things that make a raw path string invalid,
 * checked once here instead of ad hoc everywhere a path is used. The hierarchical evaluation
 * cascade (root-to-target) is a real domain rule, not incidental string plumbing — Segments/
 * ancestorPaths live here so it's defined exactly once.
 */
export class Path {
  private constructor(private readonly value: string) {}

  static parse(raw: string): Path {
    if (raw === "") {
      throw new Error("toggle path must not be empty");
    }
    for (const segment of raw.split(".")) {
      if (segment === "") {
        throw new Error("toggle path must not contain an empty segment");
      }
    }
    return new Path(raw);
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }

  segments(): string[] {
    return this.value.split(".");
  }

  /** Every proper prefix of this path, root first — for "a.b.c" that's ["a", "a.b"]. Empty for
   * a single-segment path (it has no ancestors). */
  ancestorPaths(): Path[] {
    const segments = this.segments();
    const ancestors: Path[] = [];
    for (let i = 1; i < segments.length; i++) {
      ancestors.push(new Path(segments.slice(0, i).join(".")));
    }
    return ancestors;
  }

  equals(other: Path): boolean {
    return this.value === other.value;
  }
}
