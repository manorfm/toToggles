import { Icon } from "./Icon";
import { RoleBadge } from "./RoleBadge";
import type { TeamApprover } from "../types/team";

interface MemberRowProps {
  member: TeamApprover;
  onRemove?: () => void;
  onToggleApprover?: () => void;
}

// Adaptado de get_component_spec("MemberRow") — a troca de role de fato existe no
// protótipo aqui (role-pill + dropdown), mas ficou de fora de propósito: role é global
// no usuário (entity.User.Role), mudar aqui mudaria o acesso dele em qualquer lugar do
// sistema, não só neste time — já existe uma tela dedicada pra isso
// (screens/UserManagementScreen.tsx); duplicar a mesma ação aqui criaria duas fontes de
// verdade pro mesmo estado. O switch de aprovador (POST /teams/:id/approvers/:user_id,
// docs/rest-flow.md §9.3), esse sim é exclusivo desta tela — só existe por time.
export function MemberRow({ member, onRemove, onToggleApprover }: MemberRowProps) {
  const canBeApprover = member.role === "admin";

  return (
    <div className="member">
      <div className="avatar">{member.username.slice(0, 2).toUpperCase()}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{member.username}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
          <RoleBadge role={member.role} />
          {member.is_approver && (
            <span
              className="badge"
              style={{ background: "var(--accent-soft)", color: "var(--accent)", borderColor: "transparent", fontSize: 10.5, height: 18 }}
            >
              Aprovador
            </span>
          )}
        </div>
      </div>

      {onToggleApprover && canBeApprover && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: "var(--ink-4)" }}>Aprovador</span>
          <button
            role="switch"
            aria-checked={member.is_approver}
            aria-label="Aprovador"
            className={"switch" + (member.is_approver ? " on" : "")}
            onClick={onToggleApprover}
            title={member.is_approver ? "Remover como aprovador" : "Designar como aprovador"}
          />
        </div>
      )}

      {onRemove && (
        <button className="icon-btn" title="Remove member" aria-label="Remove member" onClick={onRemove}>
          <Icon name="trash" size={15} />
        </button>
      )}
    </div>
  );
}
