import type { ToggleDetail, ToggleLeaf, ToggleNode } from "../types/toggle";

// GET .../toggles?hierarchy=true só dá a estrutura + enabled já cascateado (own AND parent); pra
// decidir corretamente o status por folha (verde/âmbar/vermelho, ver deriveCardState) e o badge
// RULE, cada nó do caminho precisa do próprio bit (não cascateado) e de has_activation_rule — que
// só existem no endpoint flat (GET .../toggles, sem hierarchy=true). flattenToLeaves funde os
// dois por id e emite uma ToggleLeaf por nó-folha (sem "toggles"), pro grid de cards do protótipo
// (TogglePaths/ToggleCard) — nunca um card por nó intermediário.
export function flattenToLeaves(hierarchy: ToggleNode[], flat: ToggleDetail[]): ToggleLeaf[] {
  const byId = new Map(flat.map((t) => [t.id, t]));
  const leaves: ToggleLeaf[] = [];

  function walk(nodes: ToggleNode[], segs: string[], ids: string[], rules: boolean[], enabledOwn: boolean[]) {
    for (const node of nodes) {
      const detail = byId.get(node.id);
      if (!detail) {
        throw new Error(`Toggle ${node.id} is present in the hierarchy but missing from the flat list`);
      }
      const nextSegs = [...segs, node.value];
      const nextIds = [...ids, node.id];
      const nextRules = [...rules, detail.has_activation_rule];
      const nextEnabledOwn = [...enabledOwn, detail.enabled];
      if (node.toggles && node.toggles.length > 0) {
        walk(node.toggles, nextSegs, nextIds, nextRules, nextEnabledOwn);
      } else {
        leaves.push({
          leafId: node.id,
          root: nextSegs[0],
          segs: nextSegs,
          ids: nextIds,
          rules: nextRules,
          enabledOwn: nextEnabledOwn,
        });
      }
    }
  }

  walk(hierarchy, [], [], [], []);
  return leaves;
}

// Pra abrir EditToggleDrawer a partir de QUALQUER segmento clicado num ToggleCard — não só a
// folha — precisamos do children count real de cada nó (ancestral ou folha), não só o da própria
// folha (que é sempre 0). ChildrenCount só existe na árvore hierárquica.
export function buildChildrenCountMap(hierarchy: ToggleNode[]): Map<string, number> {
  const map = new Map<string, number>();

  function walk(nodes: ToggleNode[]) {
    for (const node of nodes) {
      map.set(node.id, node.toggles?.length ?? 0);
      if (node.toggles) walk(node.toggles);
    }
  }

  walk(hierarchy);
  return map;
}

export function filterLeaves(leaves: ToggleLeaf[], search: string): ToggleLeaf[] {
  const q = search.trim().toLowerCase();
  if (!q) return leaves;
  return leaves.filter((leaf) => leaf.segs.join(".").toLowerCase().includes(q));
}

export type ToggleStatus = "green" | "amber" | "red";

export interface ToggleCardState {
  status: ToggleStatus;
  leafOn: boolean;
  ancestorsOn: boolean;
  hasRule: boolean;
  footText: string;
  cut: number;
}

// green = a folha e todo ancestral estão ligados; red = o próprio bit da folha está desligado
// (ganha de qualquer ancestral); amber = a folha está ligada mas foi bloqueada por um ancestral
// desligado. "cut" é o índice do primeiro ancestral desligado no caminho — TogglePaths usa isso
// pra riscar/apagar visualmente os segmentos daquele ponto em diante (o ramo morto), -1 quando
// nenhum ancestral bloqueia.
export function deriveCardState(leaf: Pick<ToggleLeaf, "rules" | "enabledOwn">): ToggleCardState {
  const lastIndex = leaf.enabledOwn.length - 1;
  const leafOn = leaf.enabledOwn[lastIndex];
  const ancestorIdx = leaf.enabledOwn.findIndex((on, i) => i < lastIndex && !on);
  const ancestorsOn = ancestorIdx === -1;
  const hasRule = leaf.rules[lastIndex];
  const status: ToggleStatus = !leafOn ? "red" : !ancestorsOn ? "amber" : "green";
  const footText = status === "green" ? "Active" : status === "red" ? "Branch disabled" : "Blocked by a parent";

  return { status, leafOn, ancestorsOn, hasRule, footText, cut: ancestorsOn ? -1 : ancestorIdx };
}
