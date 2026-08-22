import type { Application } from "../types/application";
import { applicationAccent } from "../lib/applicationAccent";

interface AppCardProps {
  application: Application;
}

// Adaptado de get_full_jsx("AppCard") — time/chave de serviço ficam de fora por
// enquanto: GET /applications não traz essa informação (entity.ApplicationWithCounts),
// só viria com N chamadas extras por card, o que não vale a pena aqui.
export function AppCard({ application }: AppCardProps) {
  const { accent, soft } = applicationAccent(application.id);

  return (
    <div className="card">
      <div className="app-card-top">
        <div className="app-glyph" style={{ background: soft, color: accent }}>
          {application.name.charAt(0).toUpperCase()}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="app-card-title">{application.name}</div>
        </div>
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
    </div>
  );
}
