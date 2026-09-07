import { Icon } from "./Icon";
import { APPROVAL_ACTIONS, APPROVAL_ACTION_GROUPS } from "../lib/approvalActionTypes";
import type { ApprovalActionKey, ApprovalSettings } from "../types/approvalSettings";

interface ApprovalSettingsPanelProps {
  settings: ApprovalSettings;
  busy: boolean;
  error: string | null;
  expirationDays: string;
  savingExpiration: boolean;
  onToggleSystem: () => void;
  onToggleAction: (key: ApprovalActionKey) => void;
  onExpirationDaysChange: (value: string) => void;
  onSaveExpiration: () => void;
}

// Conteúdo puro (sem fetch/estado) da aba "Settings" da tela unificada de Approvals —
// adaptado de get_full_jsx("ApprovalSettingsView"). Extraído de screens/ApprovalSettingsScreen.tsx
// quando essa virou uma aba em vez de rota própria (get_screen_full("ApprovalsView") confirma
// que "Configurar" só troca de aba dentro da mesma tela, não navega pra outro lugar).
export function ApprovalSettingsPanel({
  settings,
  busy,
  error,
  expirationDays,
  savingExpiration,
  onToggleSystem,
  onToggleAction,
  onExpirationDaysChange,
  onSaveExpiration,
}: ApprovalSettingsPanelProps) {
  const totalOn = Object.values(settings.required_actions).filter(Boolean).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 640 }}>
      {error && (
        <div className="field-hint danger">
          {error}
        </div>
      )}

      <div className="appr-system-row">
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 16 }}>Approval system</div>
          <div style={{ fontSize: 13.5, color: "var(--ink-3)", marginTop: 6, lineHeight: 1.55, maxWidth: "48ch" }}>
            {settings.approval_enabled ? (
              <>
                System <b style={{ color: "var(--accent)" }}>active</b> — configured actions go through review before
                running. Root is never blocked.
              </>
            ) : (
              <>System <b>disabled</b> — every action runs immediately, with no review step.</>
            )}
          </div>
        </div>
        <button
          aria-label="Approval system"
          className={"switch lg" + (settings.approval_enabled ? " on" : "")}
          style={{ flexShrink: 0 }}
          disabled={busy}
          onClick={onToggleSystem}
        />
      </div>

      {settings.approval_enabled && (
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 20 }}>
            <div className="section-h" style={{ margin: 0 }}>Actions that require approval</div>
            <span className="badge on">{totalOn} active</span>
          </div>
          {APPROVAL_ACTION_GROUPS.map((group) => {
            const actions = APPROVAL_ACTIONS.filter((a) => a.group === group);
            return (
              <div key={group} style={{ marginBottom: 22 }}>
                <div className="appr-action-group">{group}</div>
                <div className="appr-action-list">
                  {actions.map((action, i) => (
                    <div
                      key={action.key}
                      className="appr-action-row"
                      style={{ borderBottom: i < actions.length - 1 ? "1px solid var(--border)" : "none" }}
                    >
                      <div>
                        <div style={{ fontSize: 14 }}>{action.label}</div>
                        {action.hint && (
                          <div className="field-hint" style={{ marginTop: 3 }}>
                            {action.hint}
                          </div>
                        )}
                      </div>
                      <button
                        aria-label={action.label}
                        className={"switch" + (settings.required_actions[action.key] ? " on" : "")}
                        disabled={busy}
                        onClick={() => onToggleAction(action.key)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!settings.approval_enabled && (
        <div className="notice" style={{ maxWidth: 560 }}>
          <Icon name="warn" size={16} />
          <span>
            With the system disabled, <b>every action runs directly</b>, with no review, for all users (except root,
            who never needs approval even when the system is active).
          </span>
        </div>
      )}

      <div>
        <div className="section-h" style={{ marginBottom: 10 }}>Request expiration</div>
        <div className="field" style={{ maxWidth: 220 }}>
          <label className="field-label" htmlFor="expiration-days">
            Expiration (days)
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input"
              id="expiration-days"
              type="number"
              min={1}
              max={30}
              value={expirationDays}
              onChange={(e) => onExpirationDaysChange(e.target.value)}
            />
            <button className="btn btn-primary" onClick={onSaveExpiration} disabled={savingExpiration}>
              Save
            </button>
          </div>
          <div className="field-hint">New approval requests get this many days before they expire (1–30).</div>
        </div>
      </div>
    </div>
  );
}
