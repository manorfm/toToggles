import { useState } from "react";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { ApiError } from "../api/client";
import { suggestToggleChange } from "../api/toggles";
import type { ToggleLeaf } from "../types/toggle";

interface SuggestChangeModalProps {
  applicationId: string;
  leaf: ToggleLeaf;
  onClose: () => void;
  onSuggested: () => void;
}

// v2.6 §6.6 — porta 1:1 de SuggestChangeModal (app.jsx v2.6): o único jeito de quem não pode
// editar (role user) propor uma mudança em vez de aplicá-la direto. Sempre cria uma solicitação
// de aprovação (POST .../suggest), nunca passa pelo guard de intercept — não há "aplicar direto"
// a interceptar aqui.
export function SuggestChangeModal({ applicationId, leaf, onClose, onSuggested }: SuggestChangeModalProps) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const willEnable = !leaf.enabledOwn[leaf.enabledOwn.length - 1];

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await suggestToggleChange(applicationId, leaf.leafId, willEnable, note.trim());
      onSuggested();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível enviar a sugestão. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      icon="rocket"
      title="Suggest a change"
      sub="Sent to your team's approvers for review"
      onClose={onClose}
      closeable={!submitting}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={submitting}>
            <Icon name="check" size={16} /> {submitting ? "Sending…" : "Send suggestion"}
          </button>
        </>
      }
    >
      <div className="confirm-toggle-path">{leaf.segs.join(".")}</div>
      <div className="confirm-info">
        Suggesting to <b>{willEnable ? "enable" : "disable"}</b> this toggle.
      </div>

      <div className="field">
        <label className="field-label" htmlFor="suggest-note">
          Note <span style={{ color: "var(--ink-4)", fontWeight: 400 }}>(optional)</span>
        </label>
        <textarea
          className="input"
          id="suggest-note"
          style={{ height: 80, resize: "vertical", paddingTop: 10, lineHeight: 1.5 }}
          placeholder="Why this change?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {error && <div className="field-hint danger">{error}</div>}
    </Modal>
  );
}
