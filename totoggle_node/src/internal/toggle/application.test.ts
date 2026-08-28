import { describe, expect, it } from "vitest";
import { Path } from "./path.js";
import type { Toggle } from "./toggle.js";
import { Application } from "./application.js";

function toggle(path: string, overrides: Partial<Toggle> = {}): Toggle {
  return {
    id: path,
    path: Path.parse(path),
    value: path,
    enabled: true,
    level: 0,
    parentId: null,
    appId: "app-1",
    hasActivationRule: false,
    activationRule: null,
    ...overrides,
  };
}

describe("Application", () => {
  // The user's own t1.t2.t3 hierarchy example: querying the leaf must surface every ancestor
  // root-first, on the way down from the root.
  it("returns ancestors root-first for a three-level hierarchy", () => {
    const t1 = toggle("t1");
    const t1t2 = toggle("t1.t2");
    const t1t2t3 = toggle("t1.t2.t3");
    const app = new Application([t1, t1t2, t1t2t3]);

    expect(app.ancestorsOf(Path.parse("t1.t2.t3"))).toEqual([t1, t1t2]);
  });

  it("a root toggle has no ancestors", () => {
    const app = new Application([toggle("t1")]);
    expect(app.ancestorsOf(Path.parse("t1"))).toEqual([]);
  });

  // A segment missing from the fetched set never affects the result — it's simply absent from
  // the cascade rather than an error.
  it("skips ancestors that were never fetched", () => {
    const t1 = toggle("t1");
    const t1t2t3 = toggle("t1.t2.t3");
    const app = new Application([t1, t1t2t3]);

    expect(app.ancestorsOf(Path.parse("t1.t2.t3"))).toEqual([t1]);
  });

  it("looks up a toggle by exact path", () => {
    const t1t2 = toggle("t1.t2");
    const app = new Application([t1t2]);

    expect(app.byPath(Path.parse("t1.t2"))).toEqual(t1t2);
  });

  it("returns undefined for a path that was never fetched", () => {
    const app = new Application([]);
    expect(app.byPath(Path.parse("missing"))).toBeUndefined();
  });
});
