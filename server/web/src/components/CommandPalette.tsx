import { useState } from "react";
import { searchCommands } from "../lib/commandPalette";
import type { CommandPaletteData } from "../lib/commandPalette";
import { Icon } from "./Icon";

interface CommandPaletteProps {
  data: CommandPaletteData;
  onClose: () => void;
  onGoApp: (appId: string) => void;
  onGoToggle: (appId: string, path: string) => void;
  onGoTeams: () => void;
  onGoUsers: () => void;
}

// v2.6 §6.1/§6.2 — porta 1:1 de CommandPalette (app.jsx): busca global entre aplicações,
// toggles, times e pessoas já carregadas (ver AppShell, dono dos dados e do ⌘K/Ctrl+K que abre
// isto). O cálculo dos grupos/caps vive em lib/commandPalette.ts (testável sem DOM); este
// componente só renderiza o resultado e delega navegação pro chamador.
export function CommandPalette({ data, onClose, onGoApp, onGoToggle, onGoTeams, onGoUsers }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const hits = searchCommands(query, data);
  const noMatches = query.trim() && !hits.apps.length && !hits.toggles.length && !hits.teams.length && !hits.people.length;

  return (
    <div className="cmdk-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmdk-box">
        <div className="cmdk-input-row">
          <Icon name="search" size={17} />
          <input
            autoFocus
            placeholder="Search applications, toggles, teams, people…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onClose()}
          />
          <span className="cmdk-esc">Esc</span>
        </div>
        <div className="cmdk-list">
          {hits.apps.length > 0 && <div className="cmdk-group">Applications</div>}
          {hits.apps.map((a) => (
            <button key={a.id} className="cmdk-item" onClick={() => onGoApp(a.id)}>
              <Icon name="apps" size={15} /> {a.name}
            </button>
          ))}

          {hits.toggles.length > 0 && <div className="cmdk-group">Toggles</div>}
          {hits.toggles.map((t, i) => (
            <button key={i} className="cmdk-item" onClick={() => onGoToggle(t.appId, t.path)}>
              <Icon name="layers" size={15} /> <span className="mono">{t.path}</span>
              <span className="cmdk-sub">{t.appName}</span>
            </button>
          ))}

          {hits.teams.length > 0 && <div className="cmdk-group">Teams</div>}
          {hits.teams.map((t) => (
            <button key={t.id} className="cmdk-item" onClick={onGoTeams}>
              <Icon name="users" size={15} /> {t.name}
            </button>
          ))}

          {hits.people.length > 0 && <div className="cmdk-group">People</div>}
          {hits.people.map((p) => (
            <button key={p.id} className="cmdk-item" onClick={onGoUsers}>
              <Icon name="user" size={15} /> {p.name} <span className="cmdk-sub">@{p.username}</span>
            </button>
          ))}

          {noMatches && <div className="field-hint" style={{ padding: "16px 14px" }}>No matches.</div>}
        </div>
      </div>
    </div>
  );
}
