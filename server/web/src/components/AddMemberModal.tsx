import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { ApiError } from "../api/client";
import { listUsers } from "../api/users";
import { addTeamMember } from "../api/teams";
import type { User } from "../types/user";

interface AddMemberModalProps {
  teamId: string;
  teamName: string;
  existingMemberIds: string[];
  onClose: () => void;
  onAdded: (user: User) => void;
  // Opcional: quando ausente, o botão "Create a new user for this team" some. Confirmado
  // no MemberModal real (onPickExisting/onCreateNew) — decodificado de
  // docs/toToggle v2.6.html (ver server/CLAUDE.md, seção Frontend, sobre a técnica).
  onCreateNew?: () => void;
}

type CandidatesState = { status: "loading" } | { status: "loaded"; users: User[] } | { status: "error"; message: string };

// Adaptado de get_full_jsx("MemberModal") — o protótipo "convida por nome" (cria uma
// pessoa nova ali mesmo); a API real só associa um usuário JÁ EXISTENTE
// (POST /teams/:id/users {user_id}), então o formulário virou um <select> sobre
// GET /users (root only) em vez de campos de nome/role.
export function AddMemberModal({ teamId, teamName, existingMemberIds, onClose, onAdded, onCreateNew }: AddMemberModalProps) {
  const [candidatesState, setCandidatesState] = useState<CandidatesState>({ status: "loading" });
  const [userId, setUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listUsers()
      .then((users) => {
        if (cancelled) return;
        const candidates = users.filter((u) => !existingMemberIds.includes(u.id));
        setCandidatesState({ status: "loaded", users: candidates });
        if (candidates.length > 0) setUserId(candidates[0].id);
      })
      .catch((err) => {
        if (cancelled) return;
        setCandidatesState({ status: "error", message: err instanceof ApiError ? err.message : "Não foi possível carregar usuários." });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const candidates = candidatesState.status === "loaded" ? candidatesState.users : [];
  const noCandidates = candidatesState.status === "loaded" && candidates.length === 0;

  async function submit() {
    if (!userId) return;
    const selected = candidates.find((u) => u.id === userId);
    if (!selected) return;

    setSubmitting(true);
    setError(null);
    try {
      await addTeamMember(teamId, userId);
      onAdded(selected);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível adicionar o membro.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      icon="user"
      title="Add member"
      sub={`Invite someone to ${teamName}`}
      onClose={onClose}
      closeable={!submitting}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={submitting || noCandidates}>
            <Icon name="plus" size={16} /> {submitting ? "Adicionando…" : "Add member"}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field-label" htmlFor="member-user">
          User
        </label>
        <select
          className="select"
          id="member-user"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          disabled={candidatesState.status !== "loaded" || noCandidates}
        >
          {candidates.map((u) => (
            <option key={u.id} value={u.id}>
              {u.username}
            </option>
          ))}
        </select>
        {noCandidates && <div className="field-hint">Todos os usuários já são membros deste time.</div>}
      </div>

      {error && (
        <div className="field-hint danger">
          {error}
        </div>
      )}

      {onCreateNew && (
        <button className="btn btn-soft" style={{ width: "100%", justifyContent: "center" }} onClick={onCreateNew} disabled={submitting}>
          <Icon name="plus" size={16} /> Create a new user for this team
        </button>
      )}
    </Modal>
  );
}
