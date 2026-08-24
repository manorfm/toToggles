import { Fragment } from "react";
import { deriveCardState } from "../lib/toggleLeaves";
import type { ToggleLeaf } from "../types/toggle";
import { Icon } from "./Icon";
import { StatusRing } from "./StatusRing";

interface ToggleCardProps {
  leaf: ToggleLeaf;
  canEdit: boolean;
  onToggle: (leafId: string) => void;
  onEdit: (id: string) => void;
  onDelete: (leafId: string, path: string) => void;
}

// Um card por FOLHA (não por nó) — reconstruído de get_component_spec("ToggleCard"). Cada
// segmento do caminho é seu próprio link clicável (abre EditToggleDrawer pro id daquele nó, seja
// ancestral ou a própria folha); só a folha ganha os botões de Configure/Delete no rodapé, porque
// só ela pode ser apagada sem quebrar a árvore.
export function ToggleCard({ leaf, canEdit, onToggle, onEdit, onDelete }: ToggleCardProps) {
  const { status, leafOn, ancestorsOn, hasRule, footText, cut } = deriveCardState(leaf);
  const footColor = status === "green" ? "var(--accent)" : status === "red" ? "var(--danger)" : "var(--warn)";

  return (
    <div className={"tg-card" + (status !== "green" ? " dead" : "")}>
      <div className="tg-card-top">
        <StatusRing status={status} size={20} />
        <span className="root-chip">{leaf.root}</span>
        <span className="sp" />
        {canEdit ? (
          <button
            role="switch"
            aria-checked={leafOn}
            aria-label={leaf.segs.join(".")}
            className={"switch" + (leafOn ? " on" : "") + (!ancestorsOn ? " inherited dis" : "")}
            disabled={!ancestorsOn}
            title={!ancestorsOn ? "A parent is off" : leafOn ? "Turn off" : "Turn on"}
            onClick={() => ancestorsOn && onToggle(leaf.leafId)}
          />
        ) : (
          <button
            role="switch"
            aria-checked={leafOn}
            aria-label={leaf.segs.join(".")}
            className={"switch" + (leafOn ? " on" : "") + " dis"}
            disabled
            title="Somente leitura"
          />
        )}
      </div>

      <div className="tg-card-path">
        {leaf.segs.map((seg, i) => {
          const dimmed = cut !== -1 && i >= cut;
          return (
            <Fragment key={leaf.ids[i]}>
              {i > 0 && <span className={"path-sep" + (dimmed ? " dim" : "")}>.</span>}
              <span
                className={"seg-link" + (dimmed ? " dim" : "") + (leaf.rules[i] ? " has-rule" : "")}
                onClick={() => canEdit && onEdit(leaf.ids[i])}
                style={{ cursor: canEdit ? "pointer" : "default" }}
                title={leaf.rules[i] ? "Has activation rule" + (canEdit ? " — click to configure" : "") : canEdit ? "Click to configure" : ""}
              >
                {seg}
              </span>
            </Fragment>
          );
        })}
      </div>

      <div className="tg-card-foot">
        {hasRule && <span className="badge rule-tag">RULE</span>}
        <span style={{ color: footColor }}>{footText}</span>
        <span className="sp" />
        {canEdit && (
          <div className="node-actions">
            <button className="icon-btn" title="Configure" aria-label="Configure" onClick={() => onEdit(leaf.leafId)}>
              <Icon name="edit" size={14} />
            </button>
            <button
              className="icon-btn"
              title="Delete"
              aria-label="Delete"
              onClick={() => onDelete(leaf.leafId, leaf.segs.join("."))}
            >
              <Icon name="trash" size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
