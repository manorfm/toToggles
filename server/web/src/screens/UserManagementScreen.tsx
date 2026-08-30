import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { deleteUser, listUsers, resetUserPassword, setUserStatus } from "../api/users";
import { ConfirmModal } from "../components/ConfirmModal";
import { Icon } from "../components/Icon";
import { TempPasswordModal } from "../components/TempPasswordModal";
import { useToast } from "../components/ToastProvider";
import { UserModal } from "../components/UserModal";
import { UserRow } from "../components/UserRow";
import { useAppUser } from "../hooks/useAppUser";
import type { User } from "../types/user";

type LoadState = { status: "loading" } | { status: "loaded"; users: User[] } | { status: "error"; message: string };

// Adaptado do UsersView real do protótipo (decodificado do bundle comprimido embutido em
// docs/toToggle.html — ver o header de lib/toggleLeaves.ts pro método; a versão anterior desta
// tela foi construída antes do protótipo ganhar essa página, então era só uma aproximação).
// Rota client-side "/users" (não mais "/user-management") — segura desde a migração de toda a
// API pra debaixo de /api (ver "Separação API vs SPA" em server/CLAUDE.md), então o antigo motivo
// pra evitar esse nome de rota não existe mais.
export function UserManagementScreen() {
  const currentUser = useAppUser();
  const toast = useToast();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [tempPassword, setTempPassword] = useState<{ username: string; password: string; reset: boolean } | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listUsers()
      .then((users) => setState({ status: "loaded", users }))
      .catch((err) => {
        setState({ status: "error", message: err instanceof ApiError ? err.message : "Não foi possível carregar os usuários." });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isRoot = currentUser.role === "root";

  async function handleResetPassword(user: User) {
    setError(null);
    try {
      const result = await resetUserPassword(user.id);
      setTempPassword({ username: result.user.username, password: result.password, reset: true });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível resetar a senha.");
    }
  }

  async function handleToggleStatus(user: User) {
    setError(null);
    try {
      const activating = user.status === "disabled";
      await setUserStatus(user.id, activating);
      load();
      toast(activating ? "User reactivated" : "User deactivated");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível atualizar o status do usuário.");
    }
  }

  async function confirmDelete() {
    if (!deletingUser) return;
    try {
      await deleteUser(deletingUser.id);
      setError(null);
      setState((prev) => (prev.status === "loaded" ? { status: "loaded", users: prev.users.filter((u) => u.id !== deletingUser.id) } : prev));
      toast("User deleted");
      setDeletingUser(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível apagar o usuário.");
    }
  }

  const allUsers = state.status === "loaded" ? state.users : [];
  const visible = allUsers.filter((u) => !search || u.username.toLowerCase().includes(search.toLowerCase()));
  const pendingCount = visible.filter((u) => u.status === "pending_first_login").length;

  return (
    <div className="page">
      <div className="page-head">
        <div className="h">
          <div className="page-title">Usuários</div>
          <div className="page-desc">
            Contas de acesso ao toToggle. {isRoot ? "Root cria usuários em qualquer time." : "Admin cria usuários apenas nos times em que participa."} A
            senha provisória é exibida na criação e a troca é obrigatória no primeiro acesso.
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={16} /> Criar usuário
        </button>
      </div>

      {error && (
        <div className="field-hint" style={{ color: "var(--danger)", marginBottom: 16 }}>
          {error}
        </div>
      )}

      {state.status === "loaded" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div className="search" style={{ flex: 1, maxWidth: 320 }}>
            <Icon name="search" size={15} />
            <input placeholder="Buscar por username" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <span className="badge">
            {visible.length} usuário{visible.length !== 1 ? "s" : ""}
          </span>
          {pendingCount > 0 && (
            <span className="badge" style={{ background: "var(--warn-soft)", color: "var(--warn)", borderColor: "transparent" }}>
              {pendingCount} aguardando 1º acesso
            </span>
          )}
        </div>
      )}

      {state.status === "loading" && <div className="empty">Carregando…</div>}
      {state.status === "error" && <div className="empty">{state.message}</div>}
      {state.status === "loaded" && visible.length === 0 && (
        <div className="field-hint" style={{ padding: "8px 2px" }}>
          Nenhum usuário encontrado.
        </div>
      )}
      {state.status === "loaded" &&
        visible.map((u) => {
          const isSelf = u.id === currentUser.id;
          const manageable = !isSelf && u.role !== "root";
          return (
            <UserRow
              key={u.id}
              user={u}
              isSelf={isSelf}
              manageable={manageable}
              canDelete={isRoot && manageable}
              onResetPassword={() => handleResetPassword(u)}
              onToggleStatus={() => handleToggleStatus(u)}
              onDelete={() => setDeletingUser(u)}
            />
          );
        })}

      {creating && (
        <UserModal
          isRoot={isRoot}
          onClose={() => setCreating(false)}
          onCreated={({ user, password, warning }) => {
            setTempPassword({ username: user.username, password, reset: false });
            setError(warning ?? null);
            load();
          }}
        />
      )}

      {tempPassword && (
        <TempPasswordModal
          username={tempPassword.username}
          password={tempPassword.password}
          reset={tempPassword.reset}
          onClose={() => setTempPassword(null)}
        />
      )}

      {deletingUser && (
        <ConfirmModal
          title="Delete user"
          sub={`This will permanently remove "${deletingUser.username}"'s access.`}
          danger
          confirmLabel="Delete"
          onClose={() => setDeletingUser(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
