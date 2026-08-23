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
