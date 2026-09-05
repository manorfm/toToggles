import { Link, useNavigate } from "react-router-dom";
import type { Application } from "../types/application";
import { applicationAccent, applicationGlyph } from "../lib/applicationAccent";
import { Icon } from "./Icon";

interface AppCardProps {
  application: Application;
  // Posição da app em ordem de criação (0 = mais antiga) — indexa a paleta de 6 cores real do
  // protótipo (lib/applicationAccent.ts#HUES_CYCLE). O pai (ApplicationsScreen) resolve isso uma
  // vez pra lista inteira via creationOrderIndex, em vez de cada card recalcular a ordenação.
  accentIndex: number;
  canEdit?: boolean;
  onEdit?: (application: Application) => void;
  // v2.6 §6.4 — diferente do favorito de ToggleCard (existe pra qualquer role), o do AppCard só
  // aparece pra quem pode editar (confirmado no protótipo real: mesma condição do botão Edit).
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

// Adaptado do AppCard real do protótipo (decodificado do bundle comprimido embutido em
// docs/toToggle.html — ver o header de lib/toggleLeaves.ts pro método). Nome do time
// (`app.team`) continua de fora: `GET /applications` não traz nome de time, exigiria uma query
// nova no backend (join com times) sem relação com o indicador de chave abaixo; registrado como
// gap conhecido em server/CLAUDE.md. O 3º stat "Key" e a faixa `.app-key-row` (indicador real de
// presença de secret key) usam `has_secret_key`, que veio de uma query nova no backend
// (EXISTS sobre secret_keys, ver application_repository.go#GetAllWithToggleCounts).
export function AppCard({ application, accentIndex, canEdit = false, onEdit, isFavorite, onToggleFavorite }: AppCardProps) {
  const { accent, soft } = applicationAccent(accentIndex);
  const navigate = useNavigate();
  const hasKey = application.has_secret_key;

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
        {canEdit && onToggleFavorite && (
          <button
            className="icon-btn"
            title={isFavorite ? "Unfavorite" : "Favorite"}
            aria-label={isFavorite ? "Unfavorite" : "Favorite"}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite();
            }}
          >
            <Icon name="star" size={15} fill={isFavorite} style={isFavorite ? { color: "var(--warn)" } : undefined} />
          </button>
        )}
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
        <div className="app-stat">
          <div className={"v" + (hasKey ? " accent" : "")}>{hasKey ? "1" : "—"}</div>
          <div className="k">Key</div>
        </div>
      </div>
      <button
        className={"app-key-row" + (hasKey ? " has" : "")}
        title={hasKey ? "Manage service key" : "Generate a service key for this application"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          navigate(`/applications/${application.id}?tab=keys`);
        }}
      >
        <Icon name={hasKey ? "lock" : "key"} size={13} />
        <span className="akr-label">{hasKey ? "Service key active" : "No service key"}</span>
        <span className="akr-cta">{hasKey ? "Manage" : "Generate"}</span>
      </button>
    </Link>
  );
}
