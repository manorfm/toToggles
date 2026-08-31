import { auditEventMeta, formatAuditWhen } from "../lib/auditEvents";
import { Icon } from "./Icon";
import type { AuditLogEntry } from "../types/audit";

interface AuditRowProps {
  entry: AuditLogEntry;
  isLast: boolean;
}

// Um item da timeline do audit trail — adaptado do HistoryView real (get_screen_full não indexa
// esta tela — buraco conhecido do design-graph pra árvore autenticada de App, ver
// server/CLAUDE.md; fonte real é o bundle comprimido decodificado). `.audit-line` só existe
// entre itens (não depois do último), formando o trilho vertical contínuo.
export function AuditRow({ entry, isLast }: AuditRowProps) {
  const { icon, dot } = auditEventMeta(entry.event_type);
  const initials = entry.actor_name.slice(0, 2).toUpperCase();

  return (
    <div className="audit-item">
      <div className="audit-rail">
        <div className={"audit-dot" + (dot ? ` ${dot}` : "")}>
          <Icon name={icon} size={15} />
        </div>
        {!isLast && <div className="audit-line" />}
      </div>
      <div className="audit-body">
        <div className="audit-text">{entry.text}</div>
        {entry.target && <div className="audit-target">{entry.target}</div>}
        <div className="audit-meta">
          <span className="who">
            <span className="audit-av">{initials}</span> {entry.actor_name}
          </span>
          <span>·</span>
          <span>{formatAuditWhen(entry.created_at)}</span>
        </div>
      </div>
    </div>
  );
}
