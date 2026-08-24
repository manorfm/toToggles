import { describe, expect, it } from "vitest";
import { buildChildrenCountMap, deriveCardState, filterLeaves, flattenToLeaves } from "./toggleLeaves";
import type { ToggleDetail, ToggleNode } from "../types/toggle";

function detail(overrides: Partial<ToggleDetail> & { id: string }): ToggleDetail {
  return {
    value: "seg",
    enabled: true,
    path: "seg",
    level: 0,
    parent_id: null,
    app_id: "app-1",
    has_activation_rule: false,
    activation_rule: null,
    ...overrides,
  };
}

// user (on) -> payments (on) -> card (on, has rule)         => leaf "user.payments.card"
//                             -> reader (off, no rule)       => leaf "user.payments.reader"
//           -> billing (off)                                 => leaf "user.billing" (no children)
const hierarchy: ToggleNode[] = [
  {
    id: "user",
    value: "user",
    enabled: true,
    toggles: [
      {
        id: "payments",
        value: "payments",
        enabled: true,
        toggles: [
          { id: "card", value: "card", enabled: true },
          { id: "reader", value: "reader", enabled: false },
        ],
      },
      { id: "billing", value: "billing", enabled: false },
    ],
  },
];

const flat: ToggleDetail[] = [
  detail({ id: "user", value: "user", enabled: true }),
  detail({ id: "payments", value: "payments", enabled: true }),
  detail({ id: "card", value: "card", enabled: true, has_activation_rule: true }),
  detail({ id: "reader", value: "reader", enabled: false }),
  detail({ id: "billing", value: "billing", enabled: false }),
];

describe("flattenToLeaves", () => {
  it("emits one leaf per node with no children, skipping branch nodes", () => {
    const leaves = flattenToLeaves(hierarchy, flat);

    expect(leaves.map((l) => l.leafId)).toEqual(["card", "reader", "billing"]);
  });

  it("builds parallel segs/ids/rules/enabledOwn arrays from root to the leaf", () => {
    const [cardLeaf] = flattenToLeaves(hierarchy, flat);

    expect(cardLeaf.root).toBe("user");
    expect(cardLeaf.segs).toEqual(["user", "payments", "card"]);
    expect(cardLeaf.ids).toEqual(["user", "payments", "card"]);
    expect(cardLeaf.rules).toEqual([false, false, true]);
    expect(cardLeaf.enabledOwn).toEqual([true, true, true]);
  });

  it("uses the flat endpoint's own (non-cascaded) enabled bit, not the hierarchy's cascaded one", () => {
    // "billing" is a root-level leaf whose hierarchy node.enabled is already its own bit (false) —
    // the interesting assertion is on "reader", where hierarchy.enabled (own AND parent, both true
    // in this fixture up to "payments") would equal the flat own bit anyway. To actually prove the
    // merge picks the flat value, sabotage the hierarchy node's enabled to something the flat entry
    // disagrees with and confirm the leaf follows flat.
    const sabotaged: ToggleNode[] = [
      {
        id: "user",
        value: "user",
        enabled: true,
        toggles: [{ id: "reader", value: "reader", enabled: true /* cascaded, would say "on" */ }],
      },
    ];
    const [leaf] = flattenToLeaves(sabotaged, flat); // flat "reader".enabled is false

    expect(leaf.enabledOwn).toEqual([true, false]);
  });

  it("throws when a hierarchy node has no matching flat entry", () => {
    expect(() => flattenToLeaves(hierarchy, [])).toThrow();
  });
});

describe("buildChildrenCountMap", () => {
  it("maps every node id to its direct children count", () => {
    const map = buildChildrenCountMap(hierarchy);

    expect(map.get("user")).toBe(2);
    expect(map.get("payments")).toBe(2);
    expect(map.get("card")).toBe(0);
    expect(map.get("billing")).toBe(0);
  });
});

describe("filterLeaves", () => {
  const leaves = flattenToLeaves(hierarchy, flat);

  it("returns every leaf when the search is empty", () => {
    expect(filterLeaves(leaves, "")).toHaveLength(3);
  });

  it("matches by substring against the dotted path, case-insensitively", () => {
    expect(filterLeaves(leaves, "PAY").map((l) => l.leafId)).toEqual(["card", "reader"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterLeaves(leaves, "nope")).toEqual([]);
  });
});

describe("deriveCardState", () => {
  const leaves = flattenToLeaves(hierarchy, flat);
  const byId = Object.fromEntries(leaves.map((l) => [l.leafId, l]));

  it("is green (active) when the leaf and every ancestor are on", () => {
    const state = deriveCardState(byId.card);

    expect(state.status).toBe("green");
    expect(state.leafOn).toBe(true);
    expect(state.ancestorsOn).toBe(true);
    expect(state.hasRule).toBe(true);
    expect(state.footText).toBe("Active");
    expect(state.cut).toBe(-1);
  });

  it("is red (branch disabled) when the ROOT of the path is off, regardless of the leaf's own bit", () => {
    // A root-level leaf (segs.length === 1) is its own root, so this also covers "the leaf
    // itself is off and it has no ancestors" — same case, since root === leaf here.
    const leaf = { leafId: "x", root: "billing", segs: ["billing"], ids: ["billing"], rules: [false], enabledOwn: [false] };

    const state = deriveCardState(leaf);

    expect(state.status).toBe("red");
    expect(state.leafOn).toBe(false);
    expect(state.footText).toBe("Branch disabled");
    expect(state.cut).toBe(0);
  });

  it("is amber — not red — when only the leaf itself is off but the root and every ancestor are on", () => {
    // "reader" leaf: user(on) -> payments(on) -> reader(off). Root is on, so this is NOT red
    // even though the leaf's own bit is off — confirmed against the prototype's pathStatus(),
    // which only checks enabled[0] (the root) for red.
    const state = deriveCardState(byId.reader);

    expect(state.status).toBe("amber");
    expect(state.leafOn).toBe(false);
    expect(state.ancestorsOn).toBe(true);
    expect(state.footText).toBe("Blocked by reader"); // cut points at the leaf's own segment
    expect(state.cut).toBe(2);
  });

  it("is amber and names the specific blocking segment when a middle ancestor is off", () => {
    const leaf = { leafId: "x", root: "a", segs: ["a", "b", "c"], ids: ["a", "b", "c"], rules: [false, false, false], enabledOwn: [true, false, true] };

    const state = deriveCardState(leaf);

    expect(state.status).toBe("amber");
    expect(state.ancestorsOn).toBe(false);
    expect(state.footText).toBe("Blocked by b");
    expect(state.cut).toBe(1);
  });

  it("hasRule is true when ANY segment along the path has a rule, not just the leaf's own", () => {
    const leaf = { leafId: "x", root: "a", segs: ["a", "b"], ids: ["a", "b"], rules: [true, false], enabledOwn: [true, true] };

    expect(deriveCardState(leaf).hasRule).toBe(true);
  });
});
