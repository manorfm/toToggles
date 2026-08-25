import { useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { createUser } from "../api/users";
import { listTeamOptions, type TeamOption } from "../api/teams";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import type { CreateUserResult, UserRole } from "../types/user";

interface UserModalProps {
  isRoot: boolean;
  onClose: () => void;
  onCreated: (result: CreateUserResult) => void;
}

type TeamOptionsState = { status: "loading" } | { status: "loaded"; options: TeamOption[] } | { status: "error"; message: string };

// Adaptado do UserModal real do protótipo (decodificado do bundle comprimido embutido em
// docs/toToggle.html — ver o header de lib/toggleLeaves.ts pro método; design-graph nunca
// indexou este componente sozinho porque só existe dentro da árvore autenticada de App).
// Divergência forçada pelo modelo de dados real: o protótipo tem "Nome completo" (separado)
// que vira o username via slug — nosso entity.User só tem Username (sem campo de nome de
// exibição), então aqui só existe o campo Username, digitado direto.
export function UserModal({ isRoot, onClose, onCreated }: UserModalProps) {
  const [teamOptionsState, setTeamOptionsState] = useState<TeamOptionsState>({ status: "loading" });
  const [username, setUsername] = useState("");
  const [teamId, setTeamId] = useState("");
  const [role, setRole] = useState<UserRole & ("admin" | "user")>("user");
  const [isApprover, setIsApprover] = useState(false);
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
    const trimmed = username.trim();
    if (!trimmed) {
      setError("Informe um username.");
      return;
    }
    if (!/^[a-z0-9._-]+$/.test(trimmed)) {
      setError("Username aceita apenas letras minúsculas, números, ponto, hífen e underscore.");
      return;
    }
    if (!teamId) {
      setError("Selecione um time.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await createUser({ username: trimmed, role, teamId, isApprover });
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
      title="Criar usuário"
      sub="A conta nasce com senha provisória e troca obrigatória no primeiro acesso"
      onClose={onClose}
      closeable={!submitting}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={submitting || noTeamsAvailable}>
            <Icon name="plus" size={16} /> {submitting ? "Criando…" : "Criar usuário"}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field-label" htmlFor="new-user-username">
          Username
        </label>
        <input
          className="input mono"
          id="new-user-username"
          placeholder="ana.ribeiro"
          autoFocus
          value={username}
          onChange={(e) => {
            setUsername(e.target.value.toLowerCase());
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <div className="field-hint">O login é feito por username. Nesta fase não usamos e-mail.</div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="new-user-team">
          Time
        </label>
        <select
          className="select"
          id="new-user-team"
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
              : "Você precisa estar em um time para criar um usuário."
            : isRoot
              ? "Root pode criar em qualquer time."
              : "Admin só cria usuários nos times em que participa."}
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="new-user-role">
          Papel
        </label>
        <select
          className="select"
          id="new-user-role"
          value={role}
          onChange={(e) => {
            const next = e.target.value as "admin" | "user";
            setRole(next);
            if (next !== "admin") setIsApprover(false);
          }}
        >
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
        <div className="field-hint">
          {role === "admin" ? "Admin gerencia applications, chaves e pessoas do time." : "User tem acesso somente leitura."}
        </div>
      </div>

      {isRoot && role === "admin" && (
        <div className="field" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            role="switch"
            aria-checked={isApprover}
            aria-label="Aprovador do time"
            className={"switch" + (isApprover ? " on" : "")}
            onClick={() => setIsApprover((v) => !v)}
          />
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Aprovador do time</div>
            <div className="field-hint" style={{ marginTop: 2 }}>
              Pode aprovar solicitações abertas por outros membros.
            </div>
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
