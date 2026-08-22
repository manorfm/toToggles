import { useState } from "react";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { ApiError } from "../api/client";
import { createTeam } from "../api/teams";
import type { Team } from "../types/team";

interface CreateTeamModalProps {
  onClose: () => void;
  onCreated: (team: Team) => void;
}

// Adaptado de get_full_jsx("TeamModal") — o protótipo só tem o campo "name";
// "description" foi adicionado porque POST /teams aceita e é o único jeito de
// preenchê-la, senão essa capacidade real da API ficaria inalcançável na UI.
export function CreateTeamModal({ onClose, onCreated }: CreateTeamModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Team name is required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const team = await createTeam({ name: trimmedName, description: description.trim() });
      onCreated(team);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível criar o time. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      icon="users"
      title="New team"
      sub="Teams group people and own applications"
      onClose={onClose}
      closeable={!submitting}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={submitting}>
            <Icon name="plus" size={16} /> {submitting ? "Criando…" : "Create team"}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field-label" htmlFor="team-name">
          Team name
        </label>
        <input
          className="input"
          id="team-name"
          placeholder="e.g. Data Platform"
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="team-description">
          Description (optional)
        </label>
        <input
          className="input"
          id="team-description"
          placeholder="What does this team own?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
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
