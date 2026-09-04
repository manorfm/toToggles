import { Modal } from "./Modal";
import { Icon } from "./Icon";

interface ApprovalInterceptModalProps {
  actionDesc: string;
  path?: string;
  team?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Adaptado de ApprovalInterceptModal (modals.jsx v2.6, decodificado do bundle comprimido em
// docs/toToggle v2.6.html — mesma técnica documentada em server/CLAUDE.md, seção Frontend).
// Camada empilhada SEPARADA do formulário/drawer que a originou (hooks/useApprovalIntercept.ts
// guarda seu próprio estado) — cancelar aqui nunca fecha nem limpa o formulário de baixo, só
// este modal some, exatamente como confirmado no `app.jsx` real ("fixes: cancelling an
// intercept used to wipe the form").
export function ApprovalInterceptModal({ actionDesc, path, team, busy = false, onConfirm, onCancel }: ApprovalInterceptModalProps) {
  return (
    <Modal
      icon="check"
      title="Approval required"
      sub="This action will be sent for review before it runs"
      onClose={onCancel}
      closeable={!busy}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={onConfirm} disabled={busy}>
            <Icon name="check" size={16} /> {busy ? "Sending…" : "Send for approval"}
          </button>
        </>
      }
    >
      <div className="appr-intercept-card">
        <div className="aic-row">
          <span className="aic-label">Action</span>
          <span className="aic-val">{actionDesc}</span>
        </div>
        {path && (
          <div className="aic-row">
            <span className="aic-label">Target</span>
            <code className="aic-val mono">{path}</code>
          </div>
        )}
        {team && (
          <div className="aic-row">
            <span className="aic-label">Reviewed by</span>
            <span className="aic-val">
              Approvers of the <b>{team}</b> team
            </span>
          </div>
        )}
        <div className="aic-row" style={{ borderBottom: "none" }}>
          <span className="aic-label">Expires</span>
          <span className="aic-val">7 days</span>
        </div>
      </div>
      <div className="notice">
        <Icon name="warn" size={16} />
        <span>
          The action <b>will not run now</b>. An approver must review and authorize it before it takes effect.
        </span>
      </div>
    </Modal>
  );
}
