import { Icon } from "./Icon";
import type { User, UserRole } from "../types/user";

interface UserRowProps {
  user: User;
  isSelf: boolean;
  onRoleChange: (role: UserRole) => void;
  onDelete: () => void;
}

// Sem tela equivalente no protótipo. "Root" só aparece como opção quando é a própria
// conta (docs/rest-flow.md §3: atribuir root só é permitido pro próprio root editando a
// si mesmo) — oferecer a opção pra outra conta garantiria um 403 do servidor. Apagar a
// própria conta também é sempre recusado pela API, então o botão nem aparece.
export function UserRow({ user, isSelf, onRoleChange, onDelete }: UserRowProps) {
  return (
    <div className="member">
      <div className="avatar">{user.username.slice(0, 2).toUpperCase()}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{user.username}</div>
      </div>
      <select
        className="select"
        aria-label={`Role for ${user.username}`}
        value={user.role}
        onChange={(e) => onRoleChange(e.target.value as UserRole)}
      >
        <option value="user">User</option>
        <option value="admin">Admin</option>
        {isSelf && <option value="root">Root</option>}
      </select>
      {!isSelf && (
        <button className="icon-btn" title="Delete user" aria-label="Delete user" onClick={onDelete}>
          <Icon name="trash" size={15} />
        </button>
      )}
    </div>
  );
}
