import { useCallback, useEffect, useState } from "react";
import { AuditChips, CATEGORY_TABS, type CategoryFilter } from "../components/AuditChips";
import { AuditFeed } from "../components/AuditFeed";
import { AuditToolbar } from "../components/AuditToolbar";
import { Icon } from "../components/Icon";
import { listAuditActors, listAuditLog } from "../api/audit";
import { downloadCSV } from "../lib/csvExport";
import type { AuditActor, AuditLogEntry, AuditRange } from "../types/audit";

// "all" = chip "All time" do AuditToolbar, sem filtro de intervalo no request (ver AuditToolbar).
type RangeFilter = "all" | AuditRange;

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
//   application's Activity tab". Restrição aplicada: só root chega aqui (AppShell esconde o item
//   de nav pra quem não é root; GET /api/audit e /api/audit/actors exigem RequireRoot() no
//   backend — ver routes.go). Uma primeira versão desta tela manteve a visibilidade por time pra
//   qualquer role como divergência deliberada, mas o usuário pediu explicitamente pra restringir
//   depois de ver admin/user enxergando History quando só deveriam ver a Activity tab de cada
//   aplicação. domain/policy.AuditAccess (escopo por time) foi removido nesse mesmo commit —
//   ficou morto assim que só root passou a chamar List/ListActors.
// - page-desc/`.scope-note` (ícone shield + "Root only...") só puderam ser confirmados de verdade
//   depois que o design-graph passou a conseguir extrair HistoryView por inteiro (antes um
//   "buraco" conhecido da ferramenta — ver
//   docs/investigation/design-graph-unreachable-components.md); o texto usado antes
//   ("An append-only audit trail...") era uma aproximação razoável, mas nunca tinha sido
//   confirmado contra a fonte real.
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
          <div className="page-desc">
            Administrative audit trail — accounts, teams, applications, service keys and the approval system.
          </div>
          <div className="scope-note">
            <Icon name="shield" size={13} /> Root only. Changes to toggles live in each application's Activity tab.
          </div>
        </div>
      </div>

      <AuditChips tabs={CATEGORY_TABS} active={category} onPick={setCategory} />

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
