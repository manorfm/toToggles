import { useState } from "react";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { ApiError } from "../api/client";
import { rejectApproval } from "../api/approvals";
import type { ApprovalRequest } from "../types/approval";

interface RejectApprovalModalProps {
  request: ApprovalRequest;
  onClose: () => void;
  onRejected: () => void;
}

// Adaptado de get_full_jsx("RejectModal").
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
      title="Rejeitar solicitação"
      sub="A ação não será executada"
      onClose={onClose}
      closeable={!submitting}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button className="btn btn-danger-fill" onClick={confirm} disabled={submitting}>
            <Icon name="close" size={16} /> Confirmar rejeição
          </button>
        </>
      }
    >
      <div className="appr-intercept-card" style={{ marginBottom: 0 }}>
        <div className="aic-row">
          <span className="aic-label">Solicitante</span>
          <span className="aic-val">{request.requester_name}</span>
        </div>
        <div className="aic-row" style={{ borderBottom: "none" }}>
          <span className="aic-label">Alvo</span>
          <code className="aic-val mono">{request.toggle_path ?? request.application_name ?? request.id}</code>
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="reject-reason">
          Motivo da rejeição <span style={{ color: "var(--ink-4)", fontWeight: 400 }}>(opcional)</span>
        </label>
        <textarea
          className="input"
          id="reject-reason"
          style={{ height: 88, resize: "vertical", paddingTop: 10, lineHeight: 1.5 }}
          placeholder="Explique por que a solicitação está sendo rejeitada…"
          value={reason}
          autoFocus
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      {error && (
        <div className="field-hint" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}
    </Modal>
  );
}
