import { useEffect, useState } from "react";
import { ApprovalRow } from "../components/ApprovalRow";
import { ApiError } from "../api/client";
import { listAllApprovals } from "../api/approvals";
import type { ApprovalRequest } from "../types/approval";

type State = { status: "loading" } | { status: "loaded"; requests: ApprovalRequest[] } | { status: "error"; message: string };

// Adaptado de get_full_jsx("HistoryView") — o protótipo descreve "um audit trail de
// toda mudança do sistema", mas o backend não tem um log de auditoria genérico: a
// única trilha real disponível é o histórico de solicitações do workflow de
// aprovação (GET /approval/requests, qualquer status). Reaproveita ApprovalRow em
// modo somente-leitura em vez de inventar uma view de auditoria que não existe.
export function HistoryScreen() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    listAllApprovals()
      .then((requests) => {
        if (cancelled) return;
        const sorted = [...requests].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setState({ status: "loaded", requests: sorted });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ status: "error", message: err instanceof ApiError ? err.message : "Não foi possível carregar o histórico." });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page">
      <div className="page-head">
        <div className="h">
          <div className="page-title">History</div>
          <div className="page-desc">Histórico de solicitações do workflow de aprovação — criação, aprovação, rejeição.</div>
        </div>
      </div>

      {state.status === "loading" && <div className="empty">Carregando…</div>}
      {state.status === "error" && <div className="empty">{state.message}</div>}
      {state.status === "loaded" && state.requests.length === 0 && <div className="empty">Nothing here yet.</div>}
      {state.status === "loaded" &&
        state.requests.map((request) => (
          <ApprovalRow key={request.id} request={request} onApprove={() => {}} onReject={() => {}} readOnly />
        ))}
    </div>
  );
}
