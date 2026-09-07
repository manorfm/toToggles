import { useState } from "react";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { ACTION_LABELS } from "./ApprovalRow";
import { ApiError } from "../api/client";
import { rejectApproval } from "../api/approvals";
import type { ApprovalRequest } from "../types/approval";

interface RejectApprovalModalProps {
  request: ApprovalRequest;
  onClose: () => void;
  onRejected: () => void;
}

// Adaptado de get_full_jsx("RejectModal"). Fase 6 (fidelity pass, 2ª rodada): título/sub/labels/
// botões tinham ficado em português por engano, e a linha "Action" do resumo (confirmada no JSX
// real: Action/Requested by/Target, 3 linhas) tinha ficado de fora inteira — só existiam
// "Solicitante"/"Alvo" (2 linhas). "Action" reusa `ACTION_LABELS` de ApprovalRow.tsx (o mesmo
// texto já mostrado ali, "Create toggle" etc.) em vez de duplicar o mapa.
export function RejectApprovalModal({ request, onClose, onRejected }: RejectApprovalModalProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function confirm() {
    setSubmitting(true);
    setError(null);
    try {
      await rejectApproval(request.id, reason.trim());
      onRejected();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível rejeitar a solicitação.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      icon="close"
      title="Reject request"
      sub="The action will not run"
      onClose={onClose}
      closeable={!submitting}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="btn btn-danger-fill" onClick={confirm} disabled={submitting}>
            <Icon name="close" size={16} /> Confirm rejection
          </button>
        </>
      }
    >
      <div className="appr-intercept-card" style={{ marginBottom: 0 }}>
        <div className="aic-row">
          <span className="aic-label">Action</span>
          <span className="aic-val">{ACTION_LABELS[request.action_type]}</span>
        </div>
        <div className="aic-row">
          <span className="aic-label">Requested by</span>
          <span className="aic-val">{request.requester_name}</span>
        </div>
        <div className="aic-row" style={{ borderBottom: "none" }}>
          <span className="aic-label">Target</span>
          <code className="aic-val mono">{request.toggle_path ?? request.application_name ?? request.id}</code>
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="reject-reason">
          Rejection reason <span style={{ color: "var(--ink-4)", fontWeight: 400 }}>(optional)</span>
        </label>
        <textarea
          className="input"
          id="reject-reason"
          style={{ height: 88, resize: "vertical", paddingTop: 10, lineHeight: 1.5 }}
          placeholder="Explain why the request is being rejected…"
          value={reason}
          autoFocus
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      {error && (
        <div className="field-hint danger">
          {error}
        </div>
      )}
    </Modal>
  );
}
