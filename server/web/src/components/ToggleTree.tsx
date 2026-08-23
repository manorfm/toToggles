import type { ToggleNode } from "../types/toggle";

interface ToggleTreeProps {
  nodes: ToggleNode[];
  onToggle: (id: string, enabled: boolean) => void;
  disabled?: boolean;
  level?: number;
}

// Renderiza a árvore pré-computada de GET .../toggles?hierarchy=true (enabled já
// vem resolvido: own AND parent — não recalculamos herança aqui). Usa as classes
// .node-row/.node-seg/.indent, confirmadas no CSS do protótipo mas sem o
// componente de origem indexado no design-graph (ver global.css).
export function ToggleTree({ nodes, onToggle, disabled = false, level = 0 }: ToggleTreeProps) {
  return (
    <div>
      {nodes.map((node) => (
        <div key={node.id}>
          <div className="node-row">
            <span className="indent" style={{ width: level * 20 }} />
            <span className="node-seg">{node.value}</span>
            <button
              role="switch"
              aria-checked={node.enabled}
              aria-label={node.value}
              className={"switch" + (node.enabled ? " on" : "")}
              disabled={disabled}
              onClick={() => onToggle(node.id, !node.enabled)}
            />
          </div>
          {node.toggles && node.toggles.length > 0 && (
            <ToggleTree nodes={node.toggles} onToggle={onToggle} disabled={disabled} level={level + 1} />
          )}
        </div>
      ))}
    </div>
  );
}
