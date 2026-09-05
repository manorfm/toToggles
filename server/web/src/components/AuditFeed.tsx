import { useCallback, useEffect, useRef, useState } from "react";
import { AuditRow } from "./AuditRow";
import { Icon } from "./Icon";
import { ApiError } from "../api/client";
import type { AuditLogEntry, AuditLogPage } from "../types/audit";

type State =
  | { status: "loading" }
  | { status: "loaded"; entries: AuditLogEntry[]; nextCursor: string; loadingMore: boolean }
  | { status: "error"; message: string };

interface AuditFeedProps {
  // Uma nova IDENTIDADE de função dispara um refetch do zero (mesmo padrão de dependência de
  // useEffect) — o chamador passa um `useCallback` com os filtros atuais nas deps, sem AuditFeed
  // precisar saber o que é "categoria"/"ator"/"intervalo"/"application_id": só chama fetchPage()
  // (primeira página) ou fetchPage(cursor) (próxima).
  fetchPage: (cursor?: string) => Promise<AuditLogPage>;
  emptyDescription: string;
  // Repassa as entradas carregadas pro chamador (ex.: HistoryScreen precisa delas fora daqui,
  // pro botão Export CSV do AuditToolbar) sem duplicar o estado de paginação em dois lugares.
  onEntriesChange?: (entries: AuditLogEntry[]) => void;
}

// v2.6 §7 — port do AuditFeed real (confirmado via design-graph:
// get_component_full("AuditFeed")), com paginação infinita por cursor (IntersectionObserver num
// sentinel), divergência deliberada já discutida com o usuário: o protótipo usa uma lista
// estática única, mas o audit trail real cresce sem limite. Extraído de HistoryScreen (que já
// tinha exatamente esta lógica) pra ser reusado pela Activity tab de uma aplicação
// (ApplicationDetailScreen) — mesma UI, fonte de dados diferente.
export function AuditFeed({ fetchPage, emptyDescription, onEntriesChange }: AuditFeedProps) {
  const [state, setState] = useState<State>({ status: "loading" });
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetchPage()
      .then((page) => {
        if (cancelled) return;
        // Slice nil no Go serializa como `null`, não omitido (gin.H é um map — mesmo cuidado já
        // documentado noutros endpoints opcionais deste backend) — uma página sem nenhum evento
        // chega como `data: null`, nunca `[]`.
        setState({ status: "loaded", entries: page.data ?? [], nextCursor: page.next_cursor ?? "", loadingMore: false });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ status: "error", message: err instanceof ApiError ? err.message : "Não foi possível carregar o histórico." });
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  useEffect(() => {
    if (state.status === "loaded") onEntriesChange?.(state.entries);
  }, [state, onEntriesChange]);

  const loadMore = useCallback(() => {
    setState((prev) => {
      if (prev.status !== "loaded" || !prev.nextCursor || prev.loadingMore) return prev;
      fetchPage(prev.nextCursor)
        .then((page) => {
          setState((cur) =>
            cur.status === "loaded"
              ? { status: "loaded", entries: [...cur.entries, ...(page.data ?? [])], nextCursor: page.next_cursor ?? "", loadingMore: false }
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
  }, [fetchPage]);

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
    <>
      {state.status === "loading" && <div className="empty">Carregando…</div>}
      {state.status === "error" && <div className="empty">{state.message}</div>}
      {state.status === "loaded" && (
        // O empty state fica DENTRO de .audit no protótipo real (confirmado via design-graph:
        // `<div className="audit">{items.length === 0 && <div className="empty">...}
        // {items.map(...)}</div>`), não como irmão — herda o position:relative;
        // padding-left:6px de .audit, que um empty solto no nível de .page não tem.
        <div className="audit">
          {state.entries.length === 0 && (
            <div className="empty">
              <Icon name="history" size={40} />
              <div className="et">Nothing here yet</div>
              <div className="ed">{emptyDescription}</div>
            </div>
          )}
          {state.entries.map((entry, i) => (
            <AuditRow key={entry.id} entry={entry} isLast={i === state.entries.length - 1} />
          ))}
        </div>
      )}
      {state.status === "loaded" && state.nextCursor && <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />}
    </>
  );
}
