import type { AuditCategory } from "../types/audit";

// "" = chip "All", sem filtro de categoria no request.
export type CategoryFilter = "" | AuditCategory;

export const CATEGORY_TABS: { key: CategoryFilter; label: string }[] = [
  { key: "", label: "All" },
  { key: "toggles", label: "Toggles" },
  { key: "keys", label: "Keys" },
  { key: "access", label: "Access" },
  { key: "approvals", label: "Approvals" },
];

interface AuditChipsProps {
  tabs: { key: CategoryFilter; label: string }[];
  active: CategoryFilter;
  onPick: (key: CategoryFilter) => void;
}

// Porta 1:1 de AuditChips (confirmado via design-graph: get_full_jsx("AuditChips"), depois que a
// ferramenta passou a conseguir extrair esse componente de verdade — ver
// docs/investigation/design-graph-unreachable-components.md). Extraído do que antes era JSX
// inline em HistoryScreen pra ser reusado pela Activity tab de uma aplicação também
// (ApplicationDetailScreen) — mesma UI, mesmas 5 categorias, fonte de dados diferente (History é
// sempre por time; Activity é escopada a uma application_id só).
export function AuditChips({ tabs, active, onPick }: AuditChipsProps) {
  return (
    <div className="audit-filter">
      {tabs.map((tab) => (
        <button key={tab.key} className={"chip" + (active === tab.key ? " on" : "")} onClick={() => onPick(tab.key)}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}
