import { Icon } from "./Icon";
import { RoleBadge } from "./RoleBadge";
import { StatusPill } from "./StatusPill";
import { initialsOf } from "../lib/userDisplay";
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
// docs/toToggle.html — ver o header de lib/toggleLeaves.ts pro método). O protótipo mostra
// "{user.name}" (nome de exibição) como label principal e "@{user.username}" como linha
// secundária, com o avatar usando os initials do NOME (lib/userDisplay.ts#initialsOf) — gap real
// fechado nesta rodada: entity.User não tinha campo Name até então (server/CLAUDE.md), então essa
// era a única divergência forçada aqui; agora reflete o protótipo 1:1.
//
// Uma divergência real (não de modelo) permanece: o protótipo tem um botão "View password" pra
// reler a senha já mostrada enquanto o usuário está pending_first_login — isso só é possível lá
// porque é tudo estado em memória. Com bcrypt, uma senha já mostrada nunca pode ser lida de novo,
// então aqui só existe "Reset password" (gera uma nova, invalida a anterior), sempre,
// independente do status.
//
// Fase 6 (fidelity pass): esta rodada corrigiu os rótulos de ação que tinham ficado em
// português por engano num decode anterior — get_full_jsx("UserRow") confirma "you"/"Reset
// password"/"Reactivate"/"Disable"/"Delete user", e o separador/fallback de times ("Unassigned",
// " · "), nenhum desses em português no protótipo real.
export function UserRow({ user, isSelf, manageable, canDelete, onResetPassword, onToggleStatus, onDelete }: UserRowProps) {
  const teamNames = user.teams && user.teams.length > 0 ? user.teams.map((t) => t.name).join(" · ") : "Unassigned";

  return (
    <div className="member">
      <div className="avatar">{initialsOf(user.name)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{user.name}</span>
          <span className="mono" style={{ fontSize: 12, color: "var(--ink-4)" }}>
            @{user.username}
          </span>
          {isSelf && (
            <span className="badge" style={{ fontSize: 10.5, height: 18 }}>
              you
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
          <Icon name="lock" size={14} /> Reset password
        </button>
      )}
      {manageable && (
        <button
          className="icon-btn"
          title={user.status === "disabled" ? "Reactivate" : "Disable"}
          aria-label={user.status === "disabled" ? "Reactivate" : "Disable"}
          onClick={onToggleStatus}
        >
          <Icon name={user.status === "disabled" ? "check" : "logout"} size={15} />
        </button>
      )}
      {canDelete && (
        <button className="icon-btn" title="Delete user" aria-label="Delete user" onClick={onDelete}>
          <Icon name="trash" size={15} />
        </button>
      )}
    </div>
  );
}
