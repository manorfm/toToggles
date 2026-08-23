import { useCallback, useEffect, useState } from "react";
import { ApprovalRow } from "../components/ApprovalRow";
import { RejectApprovalModal } from "../components/RejectApprovalModal";
import { ApiError } from "../api/client";
import { approveApproval, executeApproval, listApprovableApprovals, listPendingApprovals } from "../api/approvals";
import { useAppUser } from "../hooks/useAppUser";
import type { ApprovalRequest } from "../types/approval";

type LoadState = { status: "loading" } | { status: "loaded"; requests: ApprovalRequest[] } | { status: "error"; message: string };

// root vê tudo que está pendente (GET .../pending); qualquer outra role só vê o que
// pode agir (GET .../approvable — já filtrado no servidor por aprovador do time).
export function ApprovalsScreen() {
  const user = useAppUser();
  const isRoot = user.role === "root";
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [needsExecuteRetry, setNeedsExecuteRetry] = useState<Set<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState<ApprovalRequest | null>(null);

  const load = useCallback(() => {
    const fetcher = isRoot ? listPendingApprovals : listApprovableApprovals;
    fetcher()
      .then((requests) => setState({ status: "loaded", requests }))
      .catch((err) => {
        setState({ status: "error", message: err instanceof ApiError ? err.message : "Não foi possível carregar as solicitações." });
      });
  }, [isRoot]);

  useEffect(() => {
    load();
  }, [load]);

  function clearRowError(id: string) {
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function handleApprove(id: string) {
    setBusyId(id);
    clearRowError(id);
    try {
      await approveApproval(id);
      try {
        await executeApproval(id);
        setNeedsExecuteRetry((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        load();
      } catch (err) {
        setNeedsExecuteRetry((prev) => new Set(prev).add(id));
        setRowErrors((prev) => ({
          ...prev,
          [id]: `Aprovado, mas falhou ao aplicar: ${err instanceof ApiError ? err.message : "erro desconhecido"}.`,
        }));
      }
    } catch (err) {
      setRowErrors((prev) => ({ ...prev, [id]: err instanceof ApiError ? err.message : "Não foi possível aprovar." }));
    } finally {
      setBusyId(null);
    }
  }

  async function handleRetryExecute(id: string) {
    setBusyId(id);
    try {
      await executeApproval(id);
      setNeedsExecuteRetry((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      clearRowError(id);
      load();
    } catch (err) {
      setRowErrors((prev) => ({ ...prev, [id]: err instanceof ApiError ? err.message : "Não foi possível aplicar a mudança." }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="h">
          <div className="page-title">Approvals</div>
          <div className="page-desc">Revise e aplique as solicitações que exigem aprovação antes de executar.</div>
        </div>
      </div>

      {state.status === "loading" && <div className="empty">Carregando…</div>}
      {state.status === "error" && <div className="empty">{state.message}</div>}
      {state.status === "loaded" && state.requests.length === 0 && <div className="empty">Nenhuma solicitação pendente.</div>}

      {state.status === "loaded" &&
        state.requests.map((request) => (
          <div key={request.id}>
            {needsExecuteRetry.has(request.id) ? (
              <div className="appr-row">
                <div style={{ flex: 1 }}>
                  <span className="appr-action">{request.toggle_path ?? request.application_name ?? request.id}</span>
                  {rowErrors[request.id] && (
                    <div className="field-hint" style={{ color: "var(--danger)", marginTop: 6 }}>
                      {rowErrors[request.id]}
                    </div>
                  )}
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => handleRetryExecute(request.id)} disabled={busyId === request.id}>
                  Retry
                </button>
              </div>
            ) : (
              <>
                <ApprovalRow
                  request={request}
                  onApprove={() => handleApprove(request.id)}
                  onReject={() => setRejecting(request)}
                  busy={busyId === request.id}
                />
                {rowErrors[request.id] && (
                  <div className="field-hint" style={{ color: "var(--danger)", marginTop: 6 }}>
                    {rowErrors[request.id]}
                  </div>
                )}
              </>
            )}
          </div>
        ))}

      {rejecting && (
        <RejectApprovalModal
          request={rejecting}
          onClose={() => setRejecting(null)}
          onRejected={load}
        />
      )}
    </div>
  );
}
