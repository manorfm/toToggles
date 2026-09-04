import { useState } from "react";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { ApiError } from "../api/client";
import { requestPasswordReset } from "../api/auth";

interface ForgotPasswordModalProps {
  onClose: () => void;
}

// Port 1:1 de auth.jsx#ForgotPasswordModal (v2.6 §5.5, decodificado do bundle — ver
// server/CLAUDE.md). Sem e-mail neste sistema: o pedido só vira um evento de auditoria que um
// root/admin resolve de verdade via POST /users/:id/reset-password (já existe). onSubmit chama a
// API direto daqui dentro (mesmo padrão de CreateTeamModal/outros modais deste app — o modal é
// dono da própria chamada, não recebe um callback de submissão do pai).
export function ForgotPasswordModal({ onClose }: ForgotPasswordModalProps) {
  const [username, setUsername] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmed = username.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      await requestPasswordReset(trimmed.toLowerCase());
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível enviar o pedido.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      icon="lock"
      title="Forgot your password?"
      sub="An administrator will reset it for you"
      onClose={onClose}
      footer={
        sent ? (
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={submit} disabled={submitting}>
              Request reset
            </button>
          </>
        )
      }
    >
      {!sent ? (
        <div className="field">
          <label className="field-label" htmlFor="forgot-username">
            Username
          </label>
          <input
            className="input"
            id="forgot-username"
            placeholder="e.g. marina"
            value={username}
            autoFocus
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <div className="field-hint">This creates a request an admin can see and act on — there's no email in this demo.</div>
          {error && <div className="field-hint danger">{error}</div>}
        </div>
      ) : (
        <div className="notice">
          <Icon name="check" size={16} />
          <span>
            If <b>@{username.trim().toLowerCase()}</b> exists, an administrator has been notified and will issue a new
            temporary password.
          </span>
        </div>
      )}
    </Modal>
  );
}
