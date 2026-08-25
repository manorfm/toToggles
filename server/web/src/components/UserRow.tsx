import { Icon } from "./Icon";
import { RoleBadge } from "./RoleBadge";
import { StatusPill } from "./StatusPill";
import type { User } from "../types/user";

interface UserRowProps {
  user: User;
  isSelf: boolean;
  // Reset de senha / ativar-desativar: root gerencia qualquer um, admin só quem compartilha um
  // time consigo (canManageUser no servidor, docs/rest-flow.md §3) — o client não recalcula essa
  // regra, só usa o que a tela já sabe (root, ou "está na minha lista filtrada e não sou eu").
  manageable: boolean;
  // Excluir continua root-only no servidor (não foi estendido pro mesmo escopo de
  // canManageUser nesta fase — ver server/CLAUDE.md), então tem seu próprio flag.
  canDelete: boolean;
  onResetPassword: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}

// Adaptado do UserRow real do protótipo (decodificado do bundle comprimido embutido em
// docs/toToggle.html — ver o header de lib/toggleLeaves.ts pro método). Duas divergências
// forçadas pelo que a API real tem/não tem:
// - O protótipo mostra "{user.name}" (nome de exibição, separado do username) — entity.User só
//   tem Username, sem campo de nome; aqui a linha principal é só "@{username}".
// - O protótipo tem um botão "Ver senha" pra reler a senha já mostrada enquanto o usuário está
//   pending_first_login — isso só é possível lá porque é tudo estado em memória. Com bcrypt, uma
//   senha já mostrada nunca pode ser lida de novo, então aqui só existe "Resetar senha" (gera
//   uma nova, invalida a anterior), sempre, independente do status.
export function UserRow({ user, isSelf, manageable, canDelete, onResetPassword, onToggleStatus, onDelete }: UserRowProps) {
  const teamNames = user.teams && user.teams.length > 0 ? user.teams.map((t) => t.name).join(", ") : "—";

  return (
    <div className="member">
      <div className="avatar">{user.username.slice(0, 2).toUpperCase()}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="mono" style={{ fontWeight: 600, fontSize: 14 }}>
            @{user.username}
          </span>
          {isSelf && (
            <span className="badge" style={{ fontSize: 10.5, height: 18 }}>
              você
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
          <RoleBadge role={user.role} />
          <StatusPill status={user.status} />
          <span style={{ fontSize: 12, color: "var(--ink-4)" }}>{teamNames}</span>
        </div>
      </div>

      {manageable && (
        <button className="btn btn-soft btn-sm" onClick={onResetPassword}>
          <Icon name="lock" size={14} /> Resetar senha
        </button>
      )}
      {manageable && (
        <button
          className="icon-btn"
          title={user.status === "disabled" ? "Reativar" : "Desativar"}
          aria-label={user.status === "disabled" ? "Reativar" : "Desativar"}
          onClick={onToggleStatus}
        >
          <Icon name={user.status === "disabled" ? "check" : "logout"} size={15} />
        </button>
      )}
      {canDelete && (
        <button className="icon-btn" title="Excluir usuário" aria-label="Excluir usuário" onClick={onDelete}>
          <Icon name="trash" size={15} />
        </button>
      )}
    </div>
  );
}
