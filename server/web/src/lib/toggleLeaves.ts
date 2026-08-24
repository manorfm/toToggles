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

// Port 1:1 de pathStatus()/leafPaths()/ToggleCard's inline computation no prototype real
// (decodificado do bundle comprimido embutido em docs/toToggle.html — o manifest
// "__bundler/manifest" carrega cada arquivo-fonte gzip+base64 por UUID; design-graph nunca
// indexou isso, só o branch de login de App, daí várias suposições anteriores terem saído
// erradas). Semântica CONFIRMADA, não inferida:
// - leafOn = TODO segmento do caminho (raiz→folha) está ligado — equivale a status==="green",
//   não "o bit próprio da folha" como uma versão anterior assumia.
// - status: "green" se leafOn; "red" se a RAIZ do caminho (índice 0) está desligada — não a
//   folha; qualquer outro caso (inclusive só a própria folha desligada, com raiz e demais
//   ancestrais ligados) é "amber".
// - cut = índice do primeiro segmento desligado em TODO o array (raiz→folha, folha inclusa) —
//   usado pra riscar visualmente daquele ponto em diante; pode apontar pra folha (ex.: só ela
//   está desligada) mesmo sem ancestral nenhum bloqueando.
// - hasRule = QUALQUER segmento do caminho tem regra, não só a própria folha.
// - footText do amber é DINÂMICO: "Blocked by {segmento em cut}" — nomeia o segmento
//   específico, mesmo quando esse segmento é a própria folha.
export function deriveCardState(leaf: Pick<ToggleLeaf, "segs" | "rules" | "enabledOwn">): ToggleCardState {
  const { segs, rules, enabledOwn } = leaf;
  const leafOn = enabledOwn.every(Boolean);
  const ancestorsOn = enabledOwn.slice(0, -1).every(Boolean);
  const cut = enabledOwn.findIndex((on) => !on);
  const hasRule = rules.some(Boolean);
  const status: ToggleStatus = leafOn ? "green" : !enabledOwn[0] ? "red" : "amber";
  const footText = status === "green" ? "Active" : status === "red" ? "Branch disabled" : `Blocked by ${segs[cut]}`;

  return { status, leafOn, ancestorsOn, hasRule, footText, cut };
}
