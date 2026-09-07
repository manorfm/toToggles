import { useCallback, useEffect, useState } from "react";
import { AddMemberModal } from "./AddMemberModal";
import { Icon } from "./Icon";
import { MemberRow } from "./MemberRow";
import { TempPasswordModal } from "./TempPasswordModal";
import { UserModal } from "./UserModal";
import { useToast } from "./ToastProvider";
import { ApiError } from "../api/client";
import { listTeamApprovers, removeTeamMember, setTeamApprover } from "../api/teams";
import type { TeamApprover } from "../types/team";

interface TeamMembersSectionProps {
  teamId: string;
  teamName: string;
}

type State = { status: "loading" } | { status: "loaded"; members: TeamApprover[] } | { status: "error"; message: string };

// TeamsScreen inteiro já é root-only (ver server/CLAUDE.md), então quem chega aqui
// sempre pode gerenciar membros — sem prop canManage separada. Fonte de dados é
// GET /teams/:id/approvers (não GET /teams/:id/users): já traz is_approver por membro,
// que a lista "crua" de usuários do time não tem (ver api/teams.ts#listTeamApprovers).
export function TeamMembersSection({ teamId, teamName }: TeamMembersSectionProps) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [adding, setAdding] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [tempPassword, setTempPassword] = useState<{ username: string; password: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(() => {
    listTeamApprovers(teamId)
      .then((members) => setState({ status: "loaded", members }))
      .catch((err) => {
        setState({ status: "error", message: err instanceof ApiError ? err.message : "Não foi possível carregar os membros." });
      });
  }, [teamId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRemove(userId: string) {
    try {
      await removeTeamMember(teamId, userId);
      load();
      toast("Member removed");
    } catch (err) {
      setState({ status: "error", message: err instanceof ApiError ? err.message : "Não foi possível remover o membro." });
    }
  }

  async function handleToggleApprover(userId: string, nextIsApprover: boolean) {
    setActionError(null);
    try {
      const members = await setTeamApprover(teamId, userId, nextIsApprover);
      setState({ status: "loaded", members });
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Não foi possível atualizar o aprovador.");
    }
  }

  // v2.6 §2.10 — confirmado contra get_full_jsx("TeamsView"): `{isRoot && approverCount === 0 &&
  // <span className="badge">...no approver</span>}`, approverCount vindo do MESMO GET
  // /teams/:id/approvers já carregado acima — sem endpoint novo. isRoot omitido de propósito:
  // TeamsScreen inteiro é root-only (mesma justificativa já usada nas checagens acima).
  const approverCount = state.status === "loaded" ? state.members.filter((m) => m.is_approver).length : 0;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div className="field-hint">Members</div>
        {state.status === "loaded" && approverCount === 0 && (
          <span
            className="badge"
            style={{ background: "var(--warn-soft)", color: "var(--warn)", borderColor: "transparent", display: "flex", alignItems: "center", gap: 4 }}
          >
            <Icon name="warn" size={11} /> no approver
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button className="btn btn-soft btn-sm" onClick={() => setAdding(true)}>
          <Icon name="plus" size={14} /> Add member
        </button>
      </div>

      {actionError && (
        <div className="field-hint danger" style={{ marginBottom: 8 }}>
          {actionError}
        </div>
      )}

      {state.status === "loading" && <div className="empty-ph">Carregando…</div>}
      {state.status === "error" && <div className="field-hint danger">{state.message}</div>}
      {state.status === "loaded" && state.members.length === 0 && <div className="field-hint">No members yet.</div>}
      {state.status === "loaded" &&
        state.members.map((member) => (
          <MemberRow
            key={member.user_id}
            member={member}
            onRemove={() => handleRemove(member.user_id)}
            onToggleApprover={() => handleToggleApprover(member.user_id, !member.is_approver)}
          />
        ))}

      {adding && (
        <AddMemberModal
          teamId={teamId}
          teamName={teamName}
          existingMemberIds={state.status === "loaded" ? state.members.map((m) => m.user_id) : []}
          onClose={() => setAdding(false)}
          onAdded={() => {
            load();
            toast("Member added");
          }}
          onCreateNew={() => {
            setAdding(false);
            setCreatingUser(true);
          }}
        />
      )}

      {creatingUser && (
        // TeamsScreen inteiro é root-only (ver comentário no topo), então isRoot=true sempre aqui —
        // mesma justificativa já usada acima pra não ter uma prop canManage separada.
        <UserModal
          isRoot
          presetTeamId={teamId}
          presetTeamName={teamName}
          onClose={() => setCreatingUser(false)}
          onCreated={({ user, password }) => {
            setCreatingUser(false);
            setTempPassword({ username: user.username, password });
            load();
          }}
        />
      )}

      {tempPassword && (
        <TempPasswordModal
          username={tempPassword.username}
          password={tempPassword.password}
          reset={false}
          onClose={() => {
            setTempPassword(null);
            toast("Member added");
          }}
        />
      )}
    </div>
  );
}
