import { describe, expect, it } from "vitest";
import {
  activeLeavesUnder,
  ancestorsEnabledFor,
  buildChildrenCountMap,
  countDescendants,
  countToggleTree,
  deriveCardState,
  filterLeaves,
  findToggleNode,
  flattenToLeaves,
} from "./toggleLeaves";
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

describe("countToggleTree", () => {
  // Port do countTree() real do protótipo (data.js, decodificado do bundle comprimido em
  // docs/toToggle.html — ver o header deste arquivo). Conta TODO nó da árvore (galhos e
  // folhas), não só folhas — usado pro contador "X/Y active" no header de
  // ApplicationDetailScreen. hierarchy.enabled já vem cascateado (own AND parent) do endpoint
  // real, então basta somar node.enabled direto — sem precisar recalcular ancestorsOn aqui.
  it("counts every node (branches and leaves), not just leaves", () => {
    const result = countToggleTree(hierarchy);

    // user, payments, card, reader, billing = 5 nós no total
    expect(result.total).toBe(5);
  });

  it("counts a node as 'on' using its already-cascaded enabled bit", () => {
    const result = countToggleTree(hierarchy);

    // user(on) payments(on) card(on) = 3 cascaded-on; reader(off), billing(off)
    expect(result.on).toBe(3);
  });

  it("returns zeros for an empty tree", () => {
    expect(countToggleTree([])).toEqual({ total: 0, on: 0 });
  });
});

describe("findToggleNode", () => {
  it("finds a node anywhere in the hierarchy, returning it with the root-to-node path", () => {
    const result = findToggleNode(hierarchy, "payments");

    expect(result?.node.id).toBe("payments");
    expect(result?.segs).toEqual(["user", "payments"]);
  });

  it("returns null when the id doesn't exist", () => {
    expect(findToggleNode(hierarchy, "nope")).toBeNull();
  });
});

describe("countDescendants", () => {
  // Port do countDescendants() real do protótipo (data.js) — conta todo nó ABAIXO do dado,
  // excluindo ele mesmo. Usado no ConfirmModal de exclusão de toggle (v2.6 §3.4) pra avisar
  // quantos descendentes serão levados junto por uma exclusão em cascata.
  it("counts every descendant node, excluding the node itself", () => {
    const payments = findToggleNode(hierarchy, "payments")!.node;

    expect(countDescendants(payments)).toBe(2); // card, reader
  });

  it("counts recursively across multiple branches", () => {
    const user = findToggleNode(hierarchy, "user")!.node;

    expect(countDescendants(user)).toBe(4); // payments, card, reader, billing
  });

  it("is zero for a leaf node", () => {
    const card = findToggleNode(hierarchy, "card")!.node;

    expect(countDescendants(card)).toBe(0);
  });
});

describe("activeLeavesUnder", () => {
  // Port de activeLeavesUnder() real do protótipo — lista os paths completos (raiz→folha) de
  // toda folha efetivamente ativa sob o nó dado. Diferente do protótipo (que recebe um flag
  // ancestorsOn separado porque sua árvore guarda o bit próprio, não cascateado), aqui
  // ToggleNode.enabled já vem cascateado (own AND parent) do endpoint hierarchy — então o
  // estado "efetivamente ativo" de cada folha já está embutido no próprio node.enabled, sem
  // precisar recomputar o estado dos ancestrais acima do nó.
  it("lists the full dotted path of every active leaf under the node", () => {
    const payments = findToggleNode(hierarchy, "payments")!;

    expect(activeLeavesUnder(payments.node, payments.segs)).toEqual(["user.payments.card"]);
  });

  it("walks every branch, skipping leaves that are off", () => {
    const user = findToggleNode(hierarchy, "user")!;

    // reader (off) and billing (off) excluded; only card is on
    expect(activeLeavesUnder(user.node, user.segs)).toEqual(["user.payments.card"]);
  });

  it("returns the node's own path when the node itself is a leaf and on", () => {
    const card = findToggleNode(hierarchy, "card")!;

    expect(activeLeavesUnder(card.node, card.segs)).toEqual(["user.payments.card"]);
  });

  it("returns an empty array when the node itself is a leaf and off", () => {
    const billing = findToggleNode(hierarchy, "billing")!;

    expect(activeLeavesUnder(billing.node, billing.segs)).toEqual([]);
  });
});

describe("ancestorsEnabledFor", () => {
  // Port de ancestorsEnabledFor() real do protótipo — mas operando sobre ToggleLeaf.enabledOwn
  // (bit próprio, não cascateado) em vez de reandar a árvore, já que essa é a única fonte que
  // tem o bit próprio de um ancestral arbitrário (ToggleNode.enabled vem cascateado do endpoint
  // hierarchy — ver o header de flattenToLeaves acima). Usado por EditToggleDrawer (v2.6 §3.3)
  // pro aviso "This has no effect right now — {blockerSeg} above it is off".
  const blockedHierarchy: ToggleNode[] = [
    {
      id: "user",
      value: "user",
      enabled: true,
      toggles: [{ id: "payments", value: "payments", enabled: false, toggles: [{ id: "card", value: "card", enabled: false }] }],
    },
  ];
  const blockedFlat: ToggleDetail[] = [
    detail({ id: "user", value: "user", enabled: true }),
    detail({ id: "payments", value: "payments", enabled: false }),
    detail({ id: "card", value: "card", enabled: true }), // card's own bit is on, but blocked by "payments" above it
  ];
  const blockedLeaves = flattenToLeaves(blockedHierarchy, blockedFlat);

  it("names the specific ancestor segment that's off, ignoring the node's own bit", () => {
    expect(ancestorsEnabledFor(blockedLeaves, "card")).toEqual({ ok: false, blocker: "payments" });
  });

  it("is ok for a node whose own ancestors are all on", () => {
    expect(ancestorsEnabledFor(blockedLeaves, "payments")).toEqual({ ok: true, blocker: null });
  });

  it("is ok for a root-level node (no ancestors at all)", () => {
    expect(ancestorsEnabledFor(blockedLeaves, "user")).toEqual({ ok: true, blocker: null });
  });

  it("is ok, by default, for an id that isn't present in any leaf", () => {
    expect(ancestorsEnabledFor(blockedLeaves, "nope")).toEqual({ ok: true, blocker: null });
  });

  it("matches the normal (unblocked) fixture too", () => {
    const leaves = flattenToLeaves(hierarchy, flat);

    expect(ancestorsEnabledFor(leaves, "reader")).toEqual({ ok: true, blocker: null });
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
