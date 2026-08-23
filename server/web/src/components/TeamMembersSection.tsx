import { useCallback, useEffect, useState } from "react";
import { AddMemberModal } from "./AddMemberModal";
import { Icon } from "./Icon";
import { MemberRow } from "./MemberRow";
import { ApiError } from "../api/client";
import { listTeamMembers, removeTeamMember } from "../api/teams";
import type { User } from "../types/user";

interface TeamMembersSectionProps {
  teamId: string;
  teamName: string;
}

type State = { status: "loading" } | { status: "loaded"; members: User[] } | { status: "error"; message: string };

// TeamsScreen inteiro já é root-only (ver server/CLAUDE.md), então quem chega aqui
// sempre pode gerenciar membros — sem prop canManage separada.
export function TeamMembersSection({ teamId, teamName }: TeamMembersSectionProps) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    listTeamMembers(teamId)
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
    } catch (err) {
      setState({ status: "error", message: err instanceof ApiError ? err.message : "Não foi possível remover o membro." });
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div className="field-hint">Members</div>
        <button className="btn btn-soft btn-sm" onClick={() => setAdding(true)}>
          <Icon name="plus" size={14} /> Add member
        </button>
      </div>

      {state.status === "loading" && <div className="empty-ph">Carregando…</div>}
      {state.status === "error" && <div className="field-hint" style={{ color: "var(--danger)" }}>{state.message}</div>}
      {state.status === "loaded" && state.members.length === 0 && <div className="field-hint">No members yet.</div>}
      {state.status === "loaded" &&
        state.members.map((member) => <MemberRow key={member.id} member={member} onRemove={() => handleRemove(member.id)} />)}

      {adding && (
        <AddMemberModal
          teamId={teamId}
          teamName={teamName}
          existingMemberIds={state.status === "loaded" ? state.members.map((m) => m.id) : []}
          onClose={() => setAdding(false)}
          onAdded={load}
        />
      )}
    </div>
  );
}
