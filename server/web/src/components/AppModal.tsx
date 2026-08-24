import { useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { createApplication, updateApplication } from "../api/applications";
import { listTeamOptions, type TeamOption } from "../api/teams";
import type { Application, ApplicationDetail } from "../types/application";
import { Icon } from "./Icon";
import { Modal } from "./Modal";

interface AppModalProps {
  isRoot: boolean;
  initial?: { id: string; name: string };
  onClose: () => void;
  onCreated: (application: Application) => void;
  onUpdated: (application: ApplicationDetail) => void;
  onPendingApproval: (actionType: string) => void;
  onDeleteRequest?: (id: string, name: string) => void;
}

type TeamOptionsState = { status: "loading" } | { status: "loaded"; options: TeamOption[] } | { status: "error"; message: string };

// Adaptado do AppModal real do protótipo (decodificado do bundle comprimido embutido em
// docs/toToggle.html — ver o header de lib/toggleLeaves.ts pro método; design-graph nunca
// indexou este componente porque ele só existe dentro da árvore autenticada de App, que o
// get_full_jsx/get_screen_full não alcança). Substitui o antigo CreateApplicationModal
// (só criação) — agora cria E edita, igual ao confirmado.
//
// Divergência deliberada do protótipo: lá o <select> de time aparece sempre, inclusive editando
// (o modelo de dados demo é 1 app = 1 time fixo, sempre em memória). Na API real, `GET
// /applications` (ApplicationWithCounts) não devolve o time atual de cada app — pediria uma
// chamada extra por card só pra popular esse combo — e `team_id` no `PUT` é OPCIONAL (omitir =
// mantém o time atual). Editar aqui só mexe no nome; mover de time fica pra uma tela que já
// tenha o time atual carregado (ex.: ApplicationDetailScreen).
export function AppModal({ isRoot, initial, onClose, onCreated, onUpdated, onPendingApproval, onDeleteRequest }: AppModalProps) {
  const editing = !!initial;
  const [teamOptionsState, setTeamOptionsState] = useState<TeamOptionsState>({ status: "loading" });
  const [name, setName] = useState(initial?.name ?? "");
  const [teamId, setTeamId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editing) return; // time não é escolhido ao editar — ver nota acima
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
  }, [isRoot, editing]);

  const teamOptions = teamOptionsState.status === "loaded" ? teamOptionsState.options : [];
  const noTeamsAvailable = !editing && teamOptionsState.status === "loaded" && teamOptions.length === 0;

  async function submit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Application name is required.");
      return;
    }
    if (!editing && !teamId) {
      setError("Selecione um time.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (editing) {
        const result = await updateApplication(initial.id, { name: trimmedName });
        if (result.kind === "pending_approval") {
          onPendingApproval(result.actionType);
        } else {
          onUpdated(result.application);
        }
      } else {
        const result = await createApplication({ name: trimmedName, teamId });
        if (result.kind === "pending_approval") {
          onPendingApproval(result.actionType);
        } else {
          onCreated(result.application);
        }
      }
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : `Não foi possível ${editing ? "atualizar" : "criar"} a aplicação. Tente novamente.`
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      icon="apps"
      title={editing ? "Edit application" : "New application"}
      sub={editing ? "Update application details" : "Applications own a hierarchy of toggles"}
      onClose={onClose}
      closeable={!submitting}
      footer={
        <>
          {editing && onDeleteRequest && (
            <button
              className="btn btn-danger"
              style={{ marginRight: "auto" }}
              disabled={submitting}
              onClick={() => onDeleteRequest(initial.id, initial.name)}
            >
              <Icon name="trash" size={14} /> Delete
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={submitting || noTeamsAvailable}>
            <Icon name="check" size={16} /> {submitting ? "Salvando…" : editing ? "Save changes" : "Create application"}
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

      {!editing && (
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
      )}

      {error && (
        <div className="field-hint" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}
    </Modal>
  );
}
