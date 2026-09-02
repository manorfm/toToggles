import { useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { createUser } from "../api/users";
import { listTeamOptions, type TeamOption } from "../api/teams";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { slugUsername } from "../lib/userDisplay";
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
//
// "Nome completo" (get_full_jsx("UserModal")) — gap real fechado nesta rodada: entity.User não
// tinha campo de nome de exibição nenhum (só Username), então esta tela (e o audit trail, que
// usa `currentUser.name`/`initials` como actor) tinham ficado sem esse campo. Fielmente portado
// do protótipo: autoFocus no nome (não mais no username), digitar o nome sugere o username via
// slugUsername() até o usuário editar o username manualmente (`touched`), e ambos são
// obrigatórios ("Informe o nome completo." é checado antes até do username no submit real).
//
// Atualização confirmada na v2.2 do protótipo (get_full_jsx("UserModal")):
// - O campo "Aprovador do time" deixou de ser montado/desmontado condicionalmente
//   (`{isRoot && role === "admin" && (...)}`) — agora fica sempre no DOM dentro de
//   `.toggle-field-wrap`, que só alterna a classe `.show` (animação CSS grid-template-rows
//   0fr→1fr, ver styles/global.css) — abre/fecha suavemente em vez de aparecer/sumir abrupto.
//   `aria-hidden` reflete o estado pra leitor de tela; `tabIndex` no switch tira ele do tab
//   order enquanto escondido (mantido montado = precisa disso, diferente de antes). O `role=
//   "switch"`/`aria-checked` do nosso switch são mantidos mesmo não aparecendo no JSX do
//   protótipo — não vamos regredir acessibilidade só porque a fonte não tem mais isso.
// - A dica do switch agora nomeia o time selecionado ("...outros membros do time {team}."),
//   antes era um texto genérico sem o nome.
// - Erro de submissão virou um banner `.notice.danger` (ícone + texto) no topo do corpo do
//   modal, não mais um `field-hint` solto no rodapé — reusa a mesma classe `.notice` que
//   EditToggleDrawer já usa pro aviso de cascata (aqui com a variante `.danger`, nova).
export function UserModal({ isRoot, onClose, onCreated }: UserModalProps) {
  const [teamOptionsState, setTeamOptionsState] = useState<TeamOptionsState>({ status: "loading" });
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);
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
  const selectedTeamName = teamOptions.find((t) => t.id === teamId)?.name;

  async function submit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Informe o nome completo.");
      return;
    }
    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setError("Informe um username.");
      return;
    }
    if (!/^[a-z0-9._-]+$/.test(trimmedUsername)) {
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
      const result = await createUser({ name: trimmedName, username: trimmedUsername, role, teamId, isApprover });
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
      {error && (
        <div className="notice danger">
          <Icon name="warn" size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="field">
        <label className="field-label" htmlFor="new-user-name">
          Nome completo
        </label>
        <input
          className="input"
          id="new-user-name"
          placeholder="ex: Ana Ribeiro"
          autoFocus
          value={name}
          onChange={(e) => {
            const v = e.target.value;
            setName(v);
            if (!usernameTouched) setUsername(slugUsername(v));
            setError(null);
          }}
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="new-user-username">
          Username
        </label>
        <input
          className="input mono"
          id="new-user-username"
          placeholder="ana.ribeiro"
          value={username}
          onChange={(e) => {
            setUsernameTouched(true);
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

      {isRoot && (
        <div className={"toggle-field-wrap" + (role === "admin" ? " show" : "")} aria-hidden={role !== "admin"}>
          <div className="toggle-field">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="toggle-field-title">Aprovador do time</div>
              <div className="field-hint" style={{ marginTop: 3 }}>
                Pode aprovar solicitações abertas por outros membros{selectedTeamName ? ` do time ${selectedTeamName}` : ""}.
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isApprover}
              aria-label="Aprovador do time"
              className={"switch" + (isApprover ? " on" : "")}
              onClick={() => setIsApprover((v) => !v)}
              tabIndex={role === "admin" ? 0 : -1}
              title={isApprover ? "Remover como aprovador" : "Designar como aprovador"}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
