// GET /applications/:id/toggles?hierarchy=true (docs/rest-flow.md §7) — shape distinta da
// entity.Toggle "crua": enabled já vem pré-computado (own AND parent), value é só o segmento
// (não o path completo) em nós não-raiz, e "toggles" só existe quando o nó tem filhos.
export interface ToggleNode {
  id: string;
  value: string;
  enabled: boolean;
  toggles?: ToggleNode[];
}

export interface ToggleHierarchy {
  application: string;
  toggles: ToggleNode[];
}

// Uma folha da árvore "achatada" pra grade de cards (TogglePaths/ToggleCard no protótipo — ver
// lib/toggleLeaves.ts#flattenToLeaves). Cada array é paralelo: segs[i]/ids[i]/rules[i]/
// enabledOwn[i] descrevem o mesmo nó do caminho, da raiz (índice 0) até a própria folha (último
// índice). enabledOwn é o bit PRÓPRIO de cada nó (não cascateado) — só existe no endpoint flat,
// por isso a folha carrega os dois em vez de reusar ToggleNode.enabled (que já vem cascateado).
export interface ToggleLeaf {
  leafId: string;
  root: string;
  segs: string[];
  ids: string[];
  rules: boolean[];
  enabledOwn: boolean[];
}

// POST /applications/:id/toggles — approval-aware, mesmo padrão de CreateApplicationResult.
export type CreateToggleResult =
  | { kind: "created"; path: string; enabled: boolean }
  | { kind: "pending_approval"; actionType: string };

// PUT /applications/:id/toggle/:toggleId — idem.
export type SetToggleEnabledResult =
  | { kind: "updated" }
  | { kind: "pending_approval"; actionType: string };

// Espelha entity.ActivationRuleType/ActivationRule.
export type ActivationRuleType = "percentage" | "parameter" | "user_id" | "ip" | "country" | "time" | "canary";

export interface ActivationRule {
  // "" confirmado ao vivo: quando has_activation_rule é false, o servidor devolve
  // activation_rule: {type:"", value:""} — objeto truthy, nunca null — em vez de omitir
  // o campo. Ver lib/activationRuleTypes.ts#deriveInitialRuleState.
  type: ActivationRuleType | "";
  value: string;
}

// GET /applications/:id/toggles/:toggleId — entity.Toggle cru (não hierarchy-resolved):
// path completo, enabled é só o próprio (não considera o pai), regra de ativação atual.
export interface ToggleDetail {
  id: string;
  value: string;
  enabled: boolean;
  path: string;
  level: number;
  parent_id: string | null;
  app_id: string;
  has_activation_rule: boolean;
  activation_rule: ActivationRule | null;
}

export interface UpdateToggleInput {
  enabled: boolean;
  hasActivationRule: boolean;
  activationRule?: ActivationRule;
}

// PUT /applications/:id/toggles/:toggleId (plural — NÃO recursivo, diferente de
// SetToggleEnabledResult) — approval-aware.
export type UpdateToggleResult =
  | { kind: "updated"; toggle: ToggleDetail }
  | { kind: "pending_approval"; actionType: string };

// DELETE /applications/:id/toggles/:toggleId — approval-aware. Nuance real (docs/rest-flow.md
// §7): um toggle com filhos NÃO é apagado, mas o servidor ainda responde 200 — não há como o
// client distinguir "apagado" de "sobreviveu por ter filhos" a partir da resposta em si, então a
// UI evita a chamada quando há filhos em vez de fingir que sempre funciona.
export type DeleteToggleResult =
  | { kind: "deleted" }
  | { kind: "pending_approval"; actionType: string };
