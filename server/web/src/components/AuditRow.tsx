import { auditEventMeta, formatAuditWhen, renderAuditText } from "../lib/auditEvents";
import { initialsOf } from "../lib/userDisplay";
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
//
// entry.actor_name agora é o nome completo do ator (AuditUseCase.Record usa actor.Name, não
// actor.Username — gap real fechado nesta rodada, entity.User não tinha campo Name até então).
// initials usa o MESMO algoritmo do protótipo real (currentUser.initials, primeira letra dos 2
// primeiros nomes) em vez de uma fatia crua do texto — "Ana Ribeiro" -> "AR", não "AN".
export function AuditRow({ entry, isLast }: AuditRowProps) {
  const { icon, dot } = auditEventMeta(entry.event_type);
  const initials = initialsOf(entry.actor_name);

  return (
    <div className="audit-item">
      <div className="audit-rail">
        <div className={"audit-dot" + (dot ? ` ${dot}` : "")}>
          <Icon name={icon} size={15} />
        </div>
        {!isLast && <div className="audit-line" />}
      </div>
      <div className="audit-body">
        <div className="audit-text">{renderAuditText(entry.text)}</div>
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
