import { filterLeaves } from "../lib/toggleLeaves";
import type { ToggleLeaf } from "../types/toggle";
import { Icon } from "./Icon";
import { ToggleCard } from "./ToggleCard";

interface TogglePathsProps {
  tree: ToggleLeaf[];
  search: string;
  setSearch: (value: string) => void;
  canEdit: boolean;
  onToggle: (leafId: string) => void;
  onEdit: (id: string) => void;
  onDelete: (leafId: string, path: string) => void;
}

// Toolbar (busca + legenda) + grade de cards — reconstruído de get_component_spec("TogglePaths").
// Substituiu o ToggleTree (lista indentada por nó), design nunca confirmado pelo protótipo.
export function TogglePaths({ tree, search, setSearch, canEdit, onToggle, onEdit, onDelete }: TogglePathsProps) {
  const filtered = filterLeaves(tree, search);

  return (
    <div>
      <div className="tree-toolbar" style={{ borderRadius: "var(--radius)", border: "1px solid var(--border)", marginBottom: 22 }}>
        <div className="search">
          <Icon name="search" size={16} />
          <input placeholder="Filter paths… e.g. payments.card" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="tree-legend">
          <span>
            <i className="lg-dot" style={{ background: "var(--accent)" }} /> active
          </span>
          <span>
            <i className="lg-dot" style={{ background: "var(--warn)" }} /> blocked
          </span>
          <span>
            <i className="lg-dot" style={{ background: "var(--danger)" }} /> off
          </span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <Icon name="toggle" size={40} />
          <div className="et">{search ? "No paths match your filter" : "No toggles yet"}</div>
          <div className="ed">{search ? "Try a different segment." : "Create your first toggle path to get started."}</div>
        </div>
      ) : (
        <div className="tg-grid">
          {filtered.map((leaf) => (
            <ToggleCard key={leaf.leafId} leaf={leaf} onEdit={onEdit} onToggle={onToggle} onDelete={onDelete} canEdit={canEdit} />
          ))}
        </div>
      )}
    </div>
  );
}
