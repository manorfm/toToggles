import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { formatAuditWhen } from "../lib/auditEvents";
import type { ArchivedToggle } from "../types/toggle";

interface ArchivedModalProps {
  entries: ArchivedToggle[];
  onClose: () => void;
  onRestore: (id: string) => void;
}

// Port 1:1 de modals.jsx#ArchivedModal (v2.6, decodificado do bundle — ver server/CLAUDE.md).
// Reusa lib/auditEvents.tsx#formatAuditWhen pro "há quanto tempo" em vez de portar o `timeAgo`
// próprio do protótipo (data.js) — as duas fontes confirmadas fazem exatamente a mesma coisa
// (tempo relativo a partir de um timestamp ISO), e já existe uma implementação testada disso
// neste código; duplicar o formatador só pra bater com o nome original divergiria da instrução
// de não espalhar a mesma lógica em lugares diferentes.
export function ArchivedModal({ entries, onClose, onRestore }: ArchivedModalProps) {
  return (
    <Modal
      icon="history"
      title="Archived toggles"
      sub="Deleted toggles are kept here for recovery"
      onClose={onClose}
      footer={
        <button className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      }
    >
      {entries.length === 0 ? (
        <div className="field-hint">Nothing archived.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {entries.map((e) => (
            <div key={e.id} className="confirm-app-row" style={{ justifyContent: "space-between" }}>
              <div style={{ minWidth: 0 }}>
                <div className="mono" style={{ fontSize: 13 }}>
                  {e.path}
                </div>
                <div className="field-hint" style={{ marginTop: 3 }}>
                  Deleted by {e.deletedByName || "someone"} · {formatAuditWhen(e.deletedAt)}
                </div>
              </div>
              <button className="btn btn-soft btn-sm" style={{ flexShrink: 0 }} onClick={() => onRestore(e.id)}>
                <Icon name="refresh" size={14} /> Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
