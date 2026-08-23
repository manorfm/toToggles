import { useState } from "react";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { ApiError } from "../api/client";
import { createUser } from "../api/users";
import type { CreateUserResult } from "../types/user";

interface CreateUserModalProps {
  onClose: () => void;
  onCreated: (result: CreateUserResult) => void;
}

// Sem tela equivalente no protótipo (User Management não existe lá — ver MemberRow.tsx
// sobre role ser global, não por time). Estilo/campos seguem o mesmo padrão de
// CreateTeamModal/CreateApplicationModal. "root" não é uma opção
// aqui: POST /users rejeita com 400 (docs/rest-flow.md §3) — só existe via troca de role.
export function CreateUserModal({ onClose, onCreated }: CreateUserModalProps) {
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const trimmed = username.trim();
    if (!trimmed) {
      setError("Username is required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await createUser({ username: trimmed, role });
      onCreated(result);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível criar o usuário. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      icon="user"
      title="New user"
      sub="The server generates a one-time password for them"
      onClose={onClose}
      closeable={!submitting}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={submitting}>
            <Icon name="plus" size={16} /> {submitting ? "Criando…" : "Create"}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field-label" htmlFor="new-user-username">
          Username
        </label>
        <input
          className="input"
          id="new-user-username"
          placeholder="e.g. bob"
          autoFocus
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="new-user-role">
          Role
        </label>
        <select className="select" id="new-user-role" value={role} onChange={(e) => setRole(e.target.value as "admin" | "user")}>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      {error && (
        <div className="field-hint" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}
    </Modal>
  );
}
