import type { TeamWithCounts } from "../types/team";

interface TeamRowProps {
  team: TeamWithCounts;
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

// Adaptado de get_full_jsx("TeamsView") — só o cabeçalho do time (nome/descrição/
// contagens); a lista de membros em si vive em TeamMembersSection, renderizada ao
// lado desta linha em TeamsScreen (GET /teams não traz membros, só contagens).
export function TeamRow({ team }: TeamRowProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="section-h" style={{ margin: 0 }}>
          {team.name}
        </div>
        {team.description && <div className="field-hint">{team.description}</div>}
      </div>
      <span className="badge">{pluralize(team.user_count, "member", "members")}</span>
      <span className="badge">{pluralize(team.application_count, "application", "applications")}</span>
    </div>
  );
}
