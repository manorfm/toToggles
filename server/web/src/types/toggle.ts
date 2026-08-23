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
