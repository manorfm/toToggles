import { useCallback, useEffect, useRef, useState } from "react";
import { AuditRow } from "../components/AuditRow";
import { Icon } from "../components/Icon";
import { ApiError } from "../api/client";
import { listAuditLog } from "../api/audit";
import type { AuditCategory, AuditLogEntry } from "../types/audit";

// "" = aba "All", sem filtro de categoria no request.
type CategoryFilter = "" | AuditCategory;

const CATEGORY_TABS: { key: CategoryFilter; label: string }[] = [
  { key: "", label: "All" },
  { key: "toggles", label: "Toggles" },
  { key: "keys", label: "Keys" },
  { key: "access", label: "Access" },
  { key: "approvals", label: "Approvals" },
];

type State =
  | { status: "loading" }
  | { status: "loaded"; entries: AuditLogEntry[]; nextCursor: string; loadingMore: boolean }
  | { status: "error"; message: string };

// Audit trail real — reconstruído do HistoryView real (design-graph não indexa esta tela, mesmo
// buraco documentado em server/CLAUDE.md pra árvore autenticada de App; fonte confiável é o
// bundle comprimido embutido em docs/toToggle.html). Consome GET /api/audit, adicionado numa
// fase anterior desta reescrita depois que o backend ganhou um audit log genérico de verdade
// (antes, esta tela só reaproveitava o histórico de aprovações — ver git blame se precisar do
// texto antigo). Duas divergências deliberadas do protótipo, as duas discutidas com o usuário
// antes de implementar:
// - Paginação infinita por cursor (IntersectionObserver num sentinel no fim da lista), não a
//   lista estática única do protótipo — o audit trail real cresce sem limite.
// - Filtro por categoria é resolvido no SERVIDOR (troca de aba reinicia a paginação do zero
//   nessa categoria), não filtrado em memória sobre um array já carregado como o protótipo faz —
//   com paginação infinita só uma fatia dos dados está carregada por vez.
export function HistoryScreen() {
  const [category, setCategory] = useState<CategoryFilter>("");
  const [state, setState] = useState<State>({ status: "loading" });
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    listAuditLog({ category: category || undefined })
      .then((page) => {
        if (cancelled) return;
        setState({ status: "loaded", entries: page.data, nextCursor: page.next_cursor, loadingMore: false });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ status: "error", message: err instanceof ApiError ? err.message : "Não foi possível carregar o histórico." });
      });
    return () => {
      cancelled = true;
    };
  }, [category]);

  const loadMore = useCallback(() => {
    setState((prev) => {
      if (prev.status !== "loaded" || !prev.nextCursor || prev.loadingMore) return prev;
      listAuditLog({ category: category || undefined, cursor: prev.nextCursor })
        .then((page) => {
          setState((cur) =>
            cur.status === "loaded"
              ? { status: "loaded", entries: [...cur.entries, ...page.data], nextCursor: page.next_cursor, loadingMore: false }
              : cur
          );
        })
        .catch(() => {
          // Falha ao carregar mais não deve derrubar o que já está na tela — só destrava o
          // sentinel pra tentar de novo no próximo scroll (ou o usuário rolar de volta).
          setState((cur) => (cur.status === "loaded" ? { ...cur, loadingMore: false } : cur));
        });
      return { ...prev, loadingMore: true };
    });
  }, [category]);

  const nextCursor = state.status === "loaded" ? state.nextCursor : "";
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !nextCursor) return;
    const observer = new IntersectionObserver((observed) => {
      if (observed[0]?.isIntersecting) loadMore();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [nextCursor, loadMore]);

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

      {state.status === "loading" && <div className="empty">Carregando…</div>}
      {state.status === "error" && <div className="empty">{state.message}</div>}
      {state.status === "loaded" && state.entries.length === 0 && (
        <div className="empty">
          <Icon name="history" size={40} />
          <div className="et">Nothing here yet</div>
          <div className="ed">No events in this category.</div>
        </div>
      )}
      {state.status === "loaded" && state.entries.length > 0 && (
        <div className="audit">
          {state.entries.map((entry, i) => (
            <AuditRow key={entry.id} entry={entry} isLast={i === state.entries.length - 1} />
          ))}
        </div>
      )}
      {state.status === "loaded" && state.nextCursor && <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />}
    </div>
  );
}
