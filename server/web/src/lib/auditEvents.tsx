import type { ReactNode } from "react";
import type { IconName } from "../components/Icon";

// Ícone + cor do dot da timeline por event_type — port do AUDIT_ICON/AUDIT_DOT reais
// (app.jsx, decodificados do bundle comprimido embutido em docs/toToggle.html — ver
// server/CLAUDE.md), a partir da tabela completa dos 21 `logAudit(...)` reais do protótipo
// (todo call site, não só uma amostra — conferido de novo depois de um usuário apontar
// divergências reais numa primeira passada desta tabela). Só UMA divergência deliberada
// permanece, por um motivo concreto (não estético): lá um `type` genérico ("create"/"delete")
// é reusado entre domínios (apagar TOGGLE e apagar USUÁRIO têm o mesmo type "delete", mesma
// cor); aqui `event_type` já é granular por domínio (entity.AuditEventType no backend), então
// cada um tem sua própria entrada — sem ambiguidade de categoria — mantendo a MESMA cor/ícone
// que o tipo real usa (ex.: `user_deleted` continua ícone "trash"/dot "del", igual ao "delete"
// real, só a CATEGORIA dele é "access" em vez de "toggles"). `approval_rejected` e
// `approval_system_toggled` foram corrigidos de volta pro que o protótipo realmente faz —
// `resolveApproval`/`updateApprovalSystem` usam o MESMO type "approval" (ícone check, dot "on")
// pra aprovar, rejeitar E ligar/desligar o sistema; uma passada anterior tinha "melhorado" isso
// sem pedir (rejeitado com ícone/cor distintos), o que já não batia com o protótipo.
// `approval_requested` e `application_updated` são novos (fecham o gap real de "tudo aparecia
// como root no History" — a solicitação em si nunca era gravada, só a aprovação; ver
// ApprovalUseCase.CreateApprovalRequest/ExecuteApprovedAction no backend).
export type AuditDotTone = "on" | "off" | "del" | "";

interface AuditEventMeta {
  icon: IconName;
  dot: AuditDotTone;
}

const AUDIT_EVENT_META: Record<string, AuditEventMeta> = {
  toggle_created: { icon: "plus", dot: "on" }, // type real: create
  toggle_deleted: { icon: "trash", dot: "del" }, // type real: delete
  toggle_enabled: { icon: "check", dot: "on" }, // type real: on
  toggle_disabled: { icon: "toggle", dot: "off" }, // type real: off
  toggle_rule_set: { icon: "sliders", dot: "off" }, // type real: rule
  application_created: { icon: "plus", dot: "on" }, // type real: create
  application_deleted: { icon: "trash", dot: "del" }, // type real: delete
  // Sem equivalente real (editar uma aplicação no protótipo só dá toast, nunca logAudit).
  application_updated: { icon: "edit", dot: "" },
  // key: MESMO ícone "key" pra gerar E revogar (o protótipo nunca troca pra "trash" na
  // revogação — só o botão de revogar em si usa trash, o evento de audit não).
  key_generated: { icon: "key", dot: "" },
  key_revoked: { icon: "key", dot: "" },
  team_created: { icon: "users", dot: "" }, // type real: team
  member_added: { icon: "user", dot: "" }, // type real: member
  // Sem equivalente real (doRemoveMember só dá toast, nunca logAudit no protótipo) — mantido
  // consistente com a família "member" (mesmo ícone "user"), já que é o parente mais próximo.
  member_removed: { icon: "user", dot: "" },
  user_created: { icon: "user", dot: "" }, // type real: member
  user_deleted: { icon: "trash", dot: "del" }, // type real: delete
  user_status_changed: { icon: "user", dot: "" }, // type real: member
  user_password_reset: { icon: "user", dot: "" }, // type real: member
  approval_approved: { icon: "check", dot: "on" }, // type real: approval
  approval_rejected: { icon: "check", dot: "on" }, // type real: approval (mesmo do approved)
  approval_system_toggled: { icon: "check", dot: "on" }, // type real: approval
  approval_requested: { icon: "clock", dot: "off" }, // type real: approval-request
};

const FALLBACK_META: AuditEventMeta = { icon: "history", dot: "" };

export function auditEventMeta(eventType: string): AuditEventMeta {
  return AUDIT_EVENT_META[eventType] ?? FALLBACK_META;
}

// Formata como o protótipo real ("12 min ago", "3 hours ago", "Yesterday", "2 days ago") em vez
// da data crua — igual à sensação de timeline "recente" do HistoryView real. Cai pra uma data
// normal (toLocaleDateString) além de uma semana, onde "N days ago" para de ser útil.
export function formatAuditWhen(isoDate: string, now: Date = new Date()): string {
  const then = new Date(isoDate);
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return then.toLocaleDateString();
}

// O protótipo real bolda o termo-chave de cada linha (ex.: `Disabled <b>experiments</b> branch`,
// confirmado tanto em app.jsx#logAudit quanto no AUDIT_SEED literal — ver server/CLAUDE.md) via
// dangerouslySetInnerHTML. NÃO reproduzimos isso com dangerouslySetInnerHTML: entry.text pode
// conter um valor definido pelo usuário (nome de time, path de toggle, nome de usuário...), e
// injetar HTML bruto a partir disso seria XSS armazenado de verdade — qualquer um com acesso ao
// team veria o JS executar. Em vez disso, o backend só emite o marcador literal `<b>...</b>`
// (nunca outra tag), e este parser reconhece SÓ esse marcador e monta elementos React de verdade
// — qualquer outro caractere (inclusive `<`/`>`/`&` vindos de um nome malicioso) vira texto puro,
// nunca é interpretado como markup. Pior caso de abuso (um nome que contenha literalmente
// "<b>...</b>") só deixa aquele trecho em negrito — cosmético, não uma vulnerabilidade.
export function renderAuditText(text: string): ReactNode[] {
  const parts = text.split(/(<b>.*?<\/b>)/g);
  return parts.map((part, i) => {
    const match = /^<b>(.*)<\/b>$/.exec(part);
    return match ? <b key={i}>{match[1]}</b> : part;
  });
}
