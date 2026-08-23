import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { deleteUser, listUsers, updateUserRole } from "../api/users";
import { ConfirmModal } from "../components/ConfirmModal";
import { CreateUserModal } from "../components/CreateUserModal";
import { GeneratedPasswordModal } from "../components/GeneratedPasswordModal";
import { Icon } from "../components/Icon";
import { UserRow } from "../components/UserRow";
import { useAppUser } from "../hooks/useAppUser";
import type { User, UserRole } from "../types/user";

type LoadState = { status: "loading" } | { status: "loaded"; users: User[] } | { status: "error"; message: string };

// Sem tela equivalente no protótipo (User Management não existe lá — só a referência em
// MemberRow.tsx sobre por que a troca de role não vive na lista de membros de um time).
// Rota client-side é "/user-management", não "/users": esse último É o prefixo real de
// API (GET/POST /users) e um hard refresh nele nunca receberia a casca do SPA.
export function UserManagementScreen() {
  const currentUser = useAppUser();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [creating, setCreating] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<{ username: string; password: string } | null>(null);
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

  async function handleRoleChange(userId: string, role: UserRole) {
    setError(null);
    try {
      await updateUserRole(userId, role);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível atualizar a role.");
    }
  }

  async function confirmDelete() {
    if (!deletingUser) return;
    try {
      await deleteUser(deletingUser.id);
      setError(null);
      setState((prev) => (prev.status === "loaded" ? { status: "loaded", users: prev.users.filter((u) => u.id !== deletingUser.id) } : prev));
      setDeletingUser(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível apagar o usuário.");
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="h">
          <div className="page-title">Users</div>
          <div className="page-desc">Root only. Create accounts, change roles, and remove access.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={16} /> New user
        </button>
      </div>

      {error && <div className="field-hint" style={{ color: "var(--danger)", marginBottom: 16 }}>{error}</div>}

      {state.status === "loading" && <div className="empty">Carregando…</div>}
      {state.status === "error" && <div className="empty">{state.message}</div>}
      {state.status === "loaded" && state.users.length === 0 && <div className="empty">Nenhum usuário ainda.</div>}
      {state.status === "loaded" &&
        state.users.map((u) => (
          <UserRow
            key={u.id}
            user={u}
            isSelf={u.id === currentUser.id}
            onRoleChange={(role) => handleRoleChange(u.id, role)}
            onDelete={() => setDeletingUser(u)}
          />
        ))}

      {creating && (
        <CreateUserModal
          onClose={() => setCreating(false)}
          onCreated={({ user, password }) => {
            setGeneratedPassword({ username: user.username, password });
            load();
          }}
        />
      )}

      {generatedPassword && (
        <GeneratedPasswordModal
          username={generatedPassword.username}
          password={generatedPassword.password}
          onClose={() => setGeneratedPassword(null)}
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
