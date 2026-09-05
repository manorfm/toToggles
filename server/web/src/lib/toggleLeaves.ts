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

// Port do countTree() real do protótipo (data.js, decodificado do bundle comprimido em
// docs/toToggle.html — ver flattenToLeaves acima pro método). Conta TODO nó da árvore (galhos e
// folhas, não só folhas) — usado pro contador "{on}/{total} active" no header de
// ApplicationDetailScreen. Ao contrário do protótipo (que recalcula ancestorsOn recursivamente
// porque sua árvore guarda o bit próprio de cada nó), o endpoint real já devolve `enabled`
// cascateado (own AND parent) em cada ToggleNode, então basta somar direto.
export function countToggleTree(hierarchy: ToggleNode[]): { total: number; on: number } {
  let total = 0;
  let on = 0;

  function walk(nodes: ToggleNode[]) {
    for (const node of nodes) {
      total++;
      if (node.enabled) on++;
      if (node.toggles) walk(node.toggles);
    }
  }

  walk(hierarchy);
  return { total, on };
}

// Localiza um nó em qualquer profundidade da hierarquia, devolvendo-o junto do caminho
// raiz→nó (segs inclui o próprio nó, ao contrário do findNode() do protótipo real, que devolve
// só o caminho ATÉ o nó — aqui o caminho completo é o formato que countDescendants/
// activeLeavesUnder abaixo precisam pra montar paths de folha).
export function findToggleNode(hierarchy: ToggleNode[], id: string): { node: ToggleNode; segs: string[] } | null {
  for (const node of hierarchy) {
    if (node.id === id) return { node, segs: [node.value] };
    const found = node.toggles ? findToggleNode(node.toggles, id) : null;
    if (found) return { node: found.node, segs: [node.value, ...found.segs] };
  }
  return null;
}

// Port de countDescendants() (data.js, ver o aviso no topo deste arquivo) — conta todo nó
// abaixo do dado, excluindo ele mesmo. Usado pelo ConfirmModal de exclusão de toggle (v2.6
// §3.4) pra avisar quantos descendentes uma exclusão em cascata vai levar junto.
export function countDescendants(node: ToggleNode): number {
  let total = 0;
  for (const child of node.toggles ?? []) {
    total++;
    total += countDescendants(child);
  }
  return total;
}

// Port de activeLeavesUnder() (data.js) — lista o path completo (pontilhado) de toda folha
// efetivamente ativa sob o nó dado. Diferente do protótipo, que recebe um flag `ancestorsOn`
// separado (sua árvore guarda só o bit PRÓPRIO de cada nó), aqui ToggleNode.enabled já vem
// cascateado (own AND parent) do endpoint hierarchy — o estado "efetivamente ativo" de cada
// folha já está embutido no próprio node.enabled, sem precisar recomputar o estado dos
// ancestrais acima do nó.
export function activeLeavesUnder(node: ToggleNode, segsToNode: string[]): string[] {
  const out: string[] = [];

  function walk(n: ToggleNode, segs: string[]) {
    if (!n.toggles || n.toggles.length === 0) {
      if (n.enabled) out.push(segs.join("."));
    } else {
      for (const child of n.toggles) walk(child, [...segs, child.value]);
    }
  }

  walk(node, segsToNode);
  return out;
}

// Port de ancestorsEnabledFor() (app.jsx) — mas sobre ToggleLeaf.enabledOwn (bit próprio,
// não cascateado) em vez de reandar a árvore, já que essa é a única fonte com o bit próprio de
// um ancestral arbitrário (ToggleNode.enabled do endpoint hierarchy já vem cascateado — ver o
// header de flattenToLeaves acima). Usado por EditToggleDrawer (v2.6 §3.3) pro aviso "This has
// no effect right now — {blockerSeg} above it is off". Só olha os segmentos ACIMA do nó (nunca
// o próprio bit dele) — mesma semântica do protótipo, onde `enabled` (o switch ao vivo no
// drawer) e `ancestorsOn` são checados separadamente (`ineffective = enabled && !ancestorsOn`).
export function ancestorsEnabledFor(leaves: ToggleLeaf[], toggleId: string): { ok: boolean; blocker: string | null } {
  for (const leaf of leaves) {
    const idx = leaf.ids.indexOf(toggleId);
    if (idx === -1) continue;
    const blockerIdx = leaf.enabledOwn.slice(0, idx).findIndex((on) => !on);
    return { ok: blockerIdx === -1, blocker: blockerIdx === -1 ? null : leaf.segs[blockerIdx] };
  }
  return { ok: true, blocker: null };
}

// Port de leafPaths() (data.js) — só o path pontilhado de cada folha, sem estado/regra. Único
// consumidor: CommandPalette (v2.6 §6.1/§6.2), que busca texto entre aplicações sem precisar de
// enabled/rule (ao contrário de flattenToLeaves, feito pro grid de cards).
export function leafDottedPaths(hierarchy: ToggleNode[]): string[] {
  const paths: string[] = [];

  function walk(nodes: ToggleNode[], segs: string[]) {
    for (const node of nodes) {
      const nextSegs = [...segs, node.value];
      if (node.toggles && node.toggles.length > 0) {
        walk(node.toggles, nextSegs);
      } else {
        paths.push(nextSegs.join("."));
      }
    }
  }

  walk(hierarchy, []);
  return paths;
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
