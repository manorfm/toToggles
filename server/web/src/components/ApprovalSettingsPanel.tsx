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
          <div style={{ fontWeight: 600, fontSize: 16 }}>Sistema de aprovação</div>
          <div style={{ fontSize: 13.5, color: "var(--ink-3)", marginTop: 6, lineHeight: 1.55, maxWidth: "48ch" }}>
            {settings.approval_enabled ? (
              <>
                Sistema <b style={{ color: "var(--accent)" }}>ativo</b> — ações configuradas passam por revisão antes de executar.
                Root nunca é bloqueado.
              </>
            ) : (
              <>Sistema <b>desativado</b> — todas as ações executam imediatamente, sem nenhuma etapa de revisão.</>
            )}
          </div>
        </div>
        <button
          aria-label="Sistema de aprovação"
          className={"switch lg" + (settings.approval_enabled ? " on" : "")}
          style={{ flexShrink: 0 }}
          disabled={busy}
          onClick={onToggleSystem}
        />
      </div>

      {settings.approval_enabled && (
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 20 }}>
            <div className="section-h" style={{ margin: 0 }}>Ações que exigem aprovação</div>
            <span className="badge on">
              {totalOn} ativa{totalOn !== 1 ? "s" : ""}
            </span>
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
            Com o sistema desativado, <b>todas as ações executam diretamente</b>, sem revisão, para todos os usuários
            (exceto root, que nunca precisa de aprovação mesmo com o sistema ativo).
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
