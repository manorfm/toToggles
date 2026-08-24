import { Link } from "react-router-dom";
import type { Application } from "../types/application";
import { applicationAccent, applicationGlyph } from "../lib/applicationAccent";
import { Icon } from "./Icon";

interface AppCardProps {
  application: Application;
  canEdit?: boolean;
  onEdit?: (application: Application) => void;
}

// Adaptado do AppCard real do protótipo (decodificado do bundle comprimido embutido em
// docs/toToggle.html — ver o header de lib/toggleLeaves.ts pro método). Time (`app.team`) e o
// terceiro stat "Key" continuam de fora: `GET /applications` (entity.ApplicationWithCounts) não
// traz nome de time nem indicador de secret key nenhum dos dois — exigiria uma query nova no
// backend (join com times/secret_keys), não só um ajuste de frontend; registrado como gap
// conhecido em server/CLAUDE.md.
export function AppCard({ application, canEdit = false, onEdit }: AppCardProps) {
  const { accent, soft } = applicationAccent(application.id);

  return (
    <Link
      to={`/applications/${application.id}`}
      className="card click"
      style={{ display: "block", color: "inherit", textDecoration: "none" }}
    >
      <div className="app-card-top">
        <div className="app-glyph" style={{ background: soft, color: accent }}>
          {applicationGlyph(application.name)}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="app-card-title">{application.name}</div>
        </div>
        {canEdit && onEdit && (
          <button
            className="icon-btn"
            title="Edit application"
            aria-label="Edit application"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEdit(application);
            }}
          >
            <Icon name="edit" size={15} />
          </button>
        )}
      </div>
      <div className="app-stats">
        <div className="app-stat">
          <div className="v">{application.toggles_total}</div>
          <div className="k">Toggles</div>
        </div>
        <div className="app-stat">
          <div className="v accent">{application.toggles_enabled}</div>
          <div className="k">Active</div>
        </div>
      </div>
    </Link>
  );
}
