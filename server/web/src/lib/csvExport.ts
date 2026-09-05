import { stripAuditMarkup } from "./auditEvents";
import type { AuditLogEntry } from "../types/audit";

// v2.6 §7 — export CSV do audit trail (AuditToolbar real, confirmado via design-graph:
// `onExport={() => downloadCSV(base, "totoggle-history.csv")}`). Colunas confirmadas: quando/
// ator/tipo/texto (sem marcação `<b>`/`<i>`)/alvo — nessa ordem, sempre entre aspas (CSV RFC
// 4180: aspas escapadas dobrando-as, nunca por barra invertida).
const HEADER = ["When", "Actor", "Type", "Text", "Target"];

function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function toCSV(entries: AuditLogEntry[]): string {
  const rows = entries.map((e) => [e.created_at, e.actor_name, e.event_type, stripAuditMarkup(e.text), e.target]);
  return [HEADER, ...rows].map((row) => row.map(csvField).join(",")).join("\r\n");
}

// Blob + <a download> client-side — sem endpoint de export no backend, o CSV é montado a partir
// da página já carregada na tela (mesma limitação/confirmação do protótipo real: exporta o que
// está visível, não refaz a query do zero).
export function downloadCSV(entries: AuditLogEntry[], filename: string): void {
  const blob = new Blob([toCSV(entries)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
