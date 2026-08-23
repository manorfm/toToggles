import { useState } from "react";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { ApiError } from "../api/client";
import { createToggle } from "../api/toggles";

interface CreateToggleModalProps {
  applicationId: string;
  onClose: () => void;
  onCreated: (result: { path: string; enabled: boolean }) => void;
  onPendingApproval: (actionType: string) => void;
}

// Adaptado de get_full_jsx("NewToggleModal").
export function CreateToggleModal({ applicationId, onClose, onCreated, onPendingApproval }: CreateToggleModalProps) {
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const parts = path.split(".").map((p) => p.trim()).filter(Boolean);

  async function submit() {
    if (parts.length === 0) return;

    setSubmitting(true);
    setError(null);
    try {
      const result = await createToggle(applicationId, parts.join("."));
      if (result.kind === "pending_approval") {
        onPendingApproval(result.actionType);
      } else {
        onCreated({ path: result.path, enabled: result.enabled });
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível criar o toggle. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      icon="toggle"
      title="New toggle"
      sub="Type a dotted path — missing segments are created automatically"
      onClose={onClose}
      closeable={!submitting}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={parts.length === 0 || submitting} onClick={submit}>
            <Icon name="plus" size={16} /> {submitting ? "Criando…" : "Create"}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field-label" htmlFor="toggle-path">
          Toggle path
        </label>
        <input
          className="input mono"
          id="toggle-path"
          placeholder="payments.card.apple-pay"
          autoFocus
          value={path}
          onChange={(e) => {
            setPath(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <div className="field-hint">
          Each segment is its own toggle. <span className="mono">a.b.c</span> nests{" "}
          <span className="mono">c</span> under <span className="mono">b</span> under <span className="mono">a</span>.
        </div>
      </div>

      <div className="path-preview">
        {parts.length === 0 ? (
          <span className="empty-ph">preview · service.feature.flag</span>
        ) : (
          parts.map((p, i) => (
            <span key={i}>
              {i > 0 && <span className="dot">.</span>}
              {p}
            </span>
          ))
        )}
      </div>

      {error && (
        <div className="field-hint" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}
    </Modal>
  );
}
