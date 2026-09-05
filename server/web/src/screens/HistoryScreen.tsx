import { useCallback, useEffect, useState } from "react";
import { AuditFeed } from "../components/AuditFeed";
import { AuditToolbar } from "../components/AuditToolbar";
import { listAuditActors, listAuditLog } from "../api/audit";
import { downloadCSV } from "../lib/csvExport";
import type { AuditActor, AuditCategory, AuditLogEntry, AuditRange } from "../types/audit";

// "" = aba "All", sem filtro de categoria no request.
type CategoryFilter = "" | AuditCategory;
// "all" = chip "All time" do AuditToolbar, sem filtro de intervalo no request (ver AuditToolbar).
type RangeFilter = "all" | AuditRange;

const CATEGORY_TABS: { key: CategoryFilter; label: string }[] = [
  { key: "", label: "All" },
  { key: "toggles", label: "Toggles" },
  { key: "keys", label: "Keys" },
  { key: "access", label: "Access" },
  { key: "approvals", label: "Approvals" },
];

// Audit trail real — reconstruído do HistoryView real (get_screen_full("HistoryView") via
// design-graph, que confirmou a estrutura AuditChips/AuditToolbar/AuditFeed usada abaixo — a
// paginação em si vive em components/AuditFeed.tsx, reusada pela Activity tab de uma aplicação,
// ver ApplicationDetailScreen). Divergências deliberadas do protótipo, discutidas com o usuário
// antes de implementar:
// - Paginação infinita por cursor (AuditFeed), não a lista estática única do protótipo — o
//   audit trail real cresce sem limite.
// - Filtro por categoria/ator/intervalo é resolvido no SERVIDOR (qualquer mudança reinicia a
//   paginação do zero), não filtrado em memória sobre um array já carregado como o protótipo faz.
// - v2.6 §7 confirmou o texto real da tela como "Root only... changes to toggles live in each
//   application's Activity tab". NÃO restringimos History a root aqui: isso removeria uma
//   funcionalidade real já existente e testada (visibilidade por time pra qualquer role, ver
//   domain/policy.AuditAccess), uma divergência deliberada demais pra fazer sem confirmar com o
//   usuário primeiro. A Activity tab por aplicação foi construída como um complemento focado,
//   não como substituição.
export function HistoryScreen() {
  const [category, setCategory] = useState<CategoryFilter>("");
  const [actorId, setActorId] = useState("");
  const [range, setRange] = useState<RangeFilter>("all");
  const [actors, setActors] = useState<AuditActor[]>([]);
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    listAuditActors()
      .then(setActors)
      .catch(() => {
        // Lista de atores é só uma conveniência de filtro — falhar aqui não deve travar a tela.
      });
  }, []);

  const fetchPage = useCallback(
    (cursor?: string) =>
      listAuditLog({ category: category || undefined, actorId: actorId || undefined, range: range === "all" ? undefined : range, cursor }),
    [category, actorId, range]
  );

  return (
    <div className="page">
      <div className="page-head">
        <div className="h">
          <div className="page-title">History</div>
          <div className="page-desc">An append-only audit trail of every change — who did what, and when.</div>
        </div>
      </div>

      <div className="audit-filter">
        {CATEGORY_TABS.map((tab) => (
          <button key={tab.key} className={"chip" + (category === tab.key ? " on" : "")} onClick={() => setCategory(tab.key)}>
            {tab.label}
          </button>
        ))}
      </div>

      <AuditToolbar
        actors={actors}
        actorId={actorId}
        onActorChange={setActorId}
        range={range}
        onRangeChange={setRange}
        exportDisabled={entries.length === 0}
        onExport={() => downloadCSV(entries, "totoggle-history.csv")}
      />

      <AuditFeed fetchPage={fetchPage} emptyDescription="No events in this category." onEntriesChange={setEntries} />
    </div>
  );
}
