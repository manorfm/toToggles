import { useState } from "react";
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
  // v2.6 §6.5 — seleção múltipla: opcional, o chip "Select" só aparece (e canEdit precisa ser
  // true) quando o chamador de fato liga o recurso.
  onBulkToggle?: (leafIds: string[], enabled: boolean) => void;
  // v2.6 §6.4/§6.6 — repassados pra cada ToggleCard, escopados por leaf.
  isFavorite?: (leaf: ToggleLeaf) => boolean;
  onToggleFavorite?: (leaf: ToggleLeaf) => void;
  onSuggest?: (leaf: ToggleLeaf) => void;
}

// Toolbar (busca + legenda + seleção múltipla) + grade de cards — reconstruído de
// get_component_spec("TogglePaths") e do JSX real decodificado (paths.jsx, ver server/CLAUDE.md).
export function TogglePaths({
  tree,
  search,
  setSearch,
  canEdit,
  onToggle,
  onEdit,
  onDelete,
  onBulkToggle,
  isFavorite,
  onToggleFavorite,
  onSuggest,
}: TogglePathsProps) {
  const filtered = filterLeaves(tree, search);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  function toggleSelect(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function exitSelect() {
    setSelectMode(false);
    setSelected([]);
  }
  function bulk(enabled: boolean) {
    onBulkToggle?.(selected, enabled);
    exitSelect();
  }

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
        {canEdit && onBulkToggle && (
          <button
            className={"chip" + (selectMode ? " on" : "")}
            onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
            style={{ marginLeft: 12 }}
          >
            {selectMode ? "Cancel selection" : "Select"}
          </button>
        )}
      </div>

      {selectMode && selected.length > 0 && (
        <div className="bulk-bar">
          <span>{selected.length} selected</span>
          <div style={{ flex: 1 }} />
          <button className="btn btn-soft btn-sm" onClick={() => bulk(false)}>
            Disable selected
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => bulk(true)}>
            Enable selected
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty">
          <Icon name="toggle" size={40} />
          <div className="et">{search ? "No paths match your filter" : "No toggles yet"}</div>
          <div className="ed">{search ? "Try a different segment." : "Create your first toggle path to get started."}</div>
        </div>
      ) : (
        <div className="tg-grid">
          {filtered.map((leaf) => (
            <ToggleCard
              key={leaf.leafId}
              leaf={leaf}
              onEdit={onEdit}
              onToggle={onToggle}
              onDelete={onDelete}
              canEdit={canEdit}
              onSuggest={onSuggest}
              isFavorite={isFavorite?.(leaf)}
              onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(leaf) : undefined}
              selectMode={selectMode}
              selected={selected.includes(leaf.leafId)}
              onSelectToggle={toggleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
