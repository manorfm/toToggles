import type { TeamWithCounts } from "../types/team";

interface TeamRowProps {
  team: TeamWithCounts;
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

// Adaptado de get_full_jsx("TeamsView") — membership/aprovadores (MemberRow, "Add
// member") ficam de fora por enquanto: GET /teams não traz a lista de membros, só
// contagens (entity.TeamWithCounts); a tela de detalhe/membros é a próxima fatia.
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
