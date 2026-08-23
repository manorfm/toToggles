import { Icon } from "./Icon";
import { RoleBadge } from "./RoleBadge";
import type { User } from "../types/user";

interface MemberRowProps {
  member: User;
  onRemove?: () => void;
}

// Adaptado de get_full_jsx("MemberRow") — troca de role e "designar aprovador" ficaram
// de fora: role é global no usuário (entity.User.Role), mudar aqui mudaria o acesso
// dele em qualquer lugar do sistema, não só neste time — merece sua própria tela
// (User Management) em vez de uma ação incidental na lista de membros de um time.
export function MemberRow({ member, onRemove }: MemberRowProps) {
  return (
    <div className="member">
      <div className="avatar">{member.username.slice(0, 2).toUpperCase()}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{member.username}</div>
        <div style={{ marginTop: 4 }}>
          <RoleBadge role={member.role} />
        </div>
      </div>
      {onRemove && (
        <button className="icon-btn" title="Remove member" aria-label="Remove member" onClick={onRemove}>
          <Icon name="trash" size={15} />
        </button>
      )}
    </div>
  );
}
