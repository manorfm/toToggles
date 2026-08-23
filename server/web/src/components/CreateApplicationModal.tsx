import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { ApiError } from "../api/client";
import { createApplication } from "../api/applications";
import { listTeamOptions, type TeamOption } from "../api/teams";
import type { Application } from "../types/application";

interface CreateApplicationModalProps {
  isRoot: boolean;
  onClose: () => void;
  onCreated: (application: Application) => void;
  onPendingApproval: (actionType: string) => void;
}

type TeamOptionsState = { status: "loading" } | { status: "loaded"; options: TeamOption[] } | { status: "error"; message: string };

// Adaptado de get_full_jsx("AppModal") — só o fluxo de criação (sem edição/exclusão,
// que dependem de rotas ainda não construídas). O <select> usa team.id como value
// (o protótipo demo usava o nome — a API real precisa do id).
export function CreateApplicationModal({ isRoot, onClose, onCreated, onPendingApproval }: CreateApplicationModalProps) {
  const [teamOptionsState, setTeamOptionsState] = useState<TeamOptionsState>({ status: "loading" });
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listTeamOptions(isRoot)
      .then((options) => {
        if (cancelled) return;
        setTeamOptionsState({ status: "loaded", options });
        if (options.length > 0) setTeamId(options[0].id);
      })
      .catch((err) => {
        if (cancelled) return;
        setTeamOptionsState({ status: "error", message: err instanceof ApiError ? err.message : "Não foi possível carregar os times." });
      });
    return () => {
      cancelled = true;
    };
  }, [isRoot]);

  const teamOptions = teamOptionsState.status === "loaded" ? teamOptionsState.options : [];
  const noTeamsAvailable = teamOptionsState.status === "loaded" && teamOptions.length === 0;

  async function submit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Application name is required.");
      return;
    }
    if (!teamId) {
      setError("Selecione um time.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await createApplication({ name: trimmedName, teamId });
      if (result.kind === "pending_approval") {
        onPendingApproval(result.actionType);
      } else {
        onCreated(result.application);
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível criar a aplicação. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      icon="apps"
      title="New application"
      sub="Applications own a hierarchy of toggles"
      onClose={onClose}
      closeable={!submitting}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={submitting || noTeamsAvailable}>
            <Icon name="check" size={16} /> {submitting ? "Criando…" : "Create application"}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field-label" htmlFor="application-name">
          Application name
        </label>
        <input
          className="input"
          id="application-name"
          placeholder="e.g. Billing Service"
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
        <label className="field-label" htmlFor="application-team">
          Team
        </label>
        <select
          className="select"
          id="application-team"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          disabled={teamOptionsState.status !== "loaded" || noTeamsAvailable}
        >
          {teamOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <div className="field-hint">
          {noTeamsAvailable
            ? isRoot
              ? "Nenhum time cadastrado ainda — crie um time primeiro."
              : "Você precisa estar em um time para criar uma aplicação."
            : "Only members of this team can manage the application."}
        </div>
      </div>

      {error && (
        <div className="field-hint" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}
    </Modal>
  );
}
