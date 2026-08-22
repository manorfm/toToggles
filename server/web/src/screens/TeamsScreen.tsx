import { useEffect, useState } from "react";
import { listTeams } from "../api/teams";
import { ApiError } from "../api/client";
import { CreateTeamModal } from "../components/CreateTeamModal";
import { Icon } from "../components/Icon";
import { TeamRow } from "../components/TeamRow";
import { useAppUser } from "../hooks/useAppUser";
import type { TeamWithCounts } from "../types/team";

type LoadState =
  | { status: "loading" }
  | { status: "loaded"; teams: TeamWithCounts[] }
  | { status: "error"; message: string };

// Adaptado de get_full_jsx("TeamsView"). Membership/aprovadores por membro
// (MemberRow) ficam de fora nesta fatia — ver nota em TeamRow.
export function TeamsScreen() {
  const user = useAppUser();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    listTeams()
      .then((teams) => {
        if (!cancelled) setState({ status: "loaded", teams });
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : "Não foi possível carregar os times.";
        setState({ status: "error", message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page">
      <div className="page-head">
        <div className="h">
          <div className="page-title">Teams & people</div>
          <div className="page-desc">Teams own applications. Members inherit access to every toggle in the apps their team manages.</div>
        </div>
        {user.role === "root" && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={16} /> New team
          </button>
        )}
      </div>

      {state.status === "loading" && <div className="empty">Carregando times…</div>}
      {state.status === "error" && <div className="empty">{state.message}</div>}
      {state.status === "loaded" && state.teams.length === 0 && <div className="empty">Nenhum time ainda.</div>}
      {state.status === "loaded" &&
        state.teams.map((team) => <TeamRow key={team.id} team={team} />)}

      {creating && (
        <CreateTeamModal
          onClose={() => setCreating(false)}
          onCreated={(team) => {
            setState((prev) =>
              prev.status === "loaded"
                ? { status: "loaded", teams: [...prev.teams, { ...team, user_count: 0, application_count: 0 }] }
                : prev
            );
          }}
        />
      )}
    </div>
  );
}
