import { Icon } from "./Icon";
import { RoleBadge } from "./RoleBadge";
import type { AuthenticatedUser } from "../types/auth";

interface UserMenuProps {
  user: AuthenticatedUser;
  onChangePassword: () => void;
  onLogout: () => void;
  onClose: () => void;
}

// Adaptado de get_full_jsx("UserMenu") — "{user.team} team" ficou de fora: GET
// /profile não traz o time do usuário (isso vive em GET /profile/teams, uma
// chamada à parte que não vale o custo só para um rótulo neste menu).
export function UserMenu({ user, onChangePassword, onLogout, onClose }: UserMenuProps) {
  return (
    <div className="user-menu" onMouseLeave={onClose}>
      <div style={{ padding: "8px 12px 6px", borderBottom: "1px solid var(--border)", marginBottom: 4 }}>
        <RoleBadge role={user.role} />
      </div>
      <button onClick={onChangePassword}>
        <Icon name="lock" size={16} /> Change password
      </button>
      <button className="danger" onClick={onLogout}>
        <Icon name="logout" size={16} /> Sign out
      </button>
    </div>
  );
}
