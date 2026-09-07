import { Icon } from "./Icon";
import type { AuditActor, AuditRange } from "../types/audit";

// v2.6 §7 — filtro por ator, intervalo de tempo e export CSV. Porta 1:1 o AuditToolbar real
// (confirmado via design-graph: get_component_full("AuditToolbar")), com uma adaptação
// deliberada: o protótipo filtra por NOME do ator (strings soltas); aqui o backend filtra por
// actor_id exato (entity.AuditLog.ActorID), então o `<select>` usa AuditActor{id,name} — mesmo
// visual, dado real por trás. "all" é um valor de UI só (não existe no backend — HistoryScreen
// traduz "all" pra "sem filtro de range" na chamada de API), igual ao protótipo real, que também
// nunca manda "all" pro servidor (lá é tudo em memória, mas a semântica de chip é a mesma).
const RANGE_CHIPS: { key: "all" | AuditRange; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "24h", label: "24h" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
];

interface AuditToolbarProps {
  // Omitido inteiro (junto com actorId/actors) na Activity tab de uma aplicação — a ActivityView
  // real confirmada (design-graph, depois que passou a extrair o componente de verdade — ver
  // docs/investigation/design-graph-unreachable-components.md) nunca teve um <select> de ator,
  // só History tem. onActorChange é o sinal de presença: só renderiza o <select> quando fornecido.
  actors?: AuditActor[];
  actorId?: string;
  onActorChange?: (actorId: string) => void;
  range: "all" | AuditRange;
  onRangeChange: (range: "all" | AuditRange) => void;
  exportDisabled: boolean;
  onExport: () => void;
}

export function AuditToolbar({ actors, actorId, onActorChange, range, onRangeChange, exportDisabled, onExport }: AuditToolbarProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
      {onActorChange && (
        <select className="select" style={{ width: 170 }} value={actorId ?? ""} onChange={(e) => onActorChange(e.target.value)}>
          <option value="">All actors</option>
          {(actors ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      )}
      <div className="audit-filter" style={{ margin: 0 }}>
        {RANGE_CHIPS.map((chip) => (
          <button key={chip.key} className={"chip" + (range === chip.key ? " on" : "")} onClick={() => onRangeChange(chip.key)}>
            {chip.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <button className="btn btn-soft btn-sm" onClick={onExport} disabled={exportDisabled}>
        <Icon name="copy" size={14} /> Export CSV
      </button>
    </div>
  );
}
