import { Icon } from "./Icon";
import type { ToggleNode } from "../types/toggle";

interface ToggleTreeProps {
  nodes: ToggleNode[];
  onToggle: (id: string, enabled: boolean) => void;
  onConfigure?: (id: string, childrenCount: number) => void;
  onDelete?: (id: string, path: string) => void;
  disabled?: boolean;
  level?: number;
  parentPath?: string;
}

// Renderiza a árvore pré-computada de GET .../toggles?hierarchy=true (enabled já
// vem resolvido: own AND parent — não recalculamos herança aqui). Usa as classes
// .node-row/.node-seg/.indent, confirmadas no CSS do protótipo mas sem o
// componente de origem indexado no design-graph (ver global.css).
export function ToggleTree({ nodes, onToggle, onConfigure, onDelete, disabled = false, level = 0, parentPath = "" }: ToggleTreeProps) {
  return (
    <div>
      {nodes.map((node) => {
        const hasChildren = (node.toggles?.length ?? 0) > 0;
        const path = parentPath ? `${parentPath}.${node.value}` : node.value;
        return (
          <div key={node.id}>
            <div className="node-row">
              <span className="indent" style={{ width: level * 20 }} />
              <span className="node-seg">{node.value}</span>
              {onConfigure && (
                <button
                  className="icon-btn"
                  title="Configure"
                  aria-label="Configure"
                  onClick={() => onConfigure(node.id, node.toggles?.length ?? 0)}
                >
                  <Icon name="edit" size={14} />
                </button>
              )}
              {onDelete && (
                <button
                  className="icon-btn"
                  title={hasChildren ? "Delete every child toggle first" : "Delete"}
                  aria-label="Delete"
                  disabled={hasChildren}
                  onClick={() => onDelete(node.id, path)}
                >
                  <Icon name="trash" size={14} />
                </button>
              )}
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
              <ToggleTree
                nodes={node.toggles}
                onToggle={onToggle}
                onConfigure={onConfigure}
                onDelete={onDelete}
                disabled={disabled}
                level={level + 1}
                parentPath={path}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
