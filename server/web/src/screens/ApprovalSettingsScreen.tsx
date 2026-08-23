import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { ApiError } from "../api/client";
import { getApprovalSettings, updateApprovalSettings } from "../api/approvalSettings";
import { APPROVAL_ACTIONS, APPROVAL_ACTION_GROUPS } from "../lib/approvalActionTypes";
import type { ApprovalSettings } from "../types/approvalSettings";

type LoadState = { status: "loading" } | { status: "loaded"; settings: ApprovalSettings } | { status: "error"; message: string };

// Adaptado de get_full_jsx("ApprovalSettingsView") — texto do master switch e do aviso de
// sistema desativado é literal do protótipo (get_full_jsx confirmado). Os labels da lista de
// ações não vieram com dado real no protótipo (APPROVAL_ACTIONS só existe como referência, sem
// os 10 valores) — vêm de ler getActionType diretamente (ver lib/approvalActionTypes.ts).
export function ApprovalSettingsScreen() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [expirationDays, setExpirationDays] = useState("");
  const [savingExpiration, setSavingExpiration] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getApprovalSettings()
      .then((settings) => {
        setState({ status: "loaded", settings });
        setExpirationDays(String(settings.default_expiration_days));
      })
      .catch((err) => {
        setState({ status: "error", message: err instanceof ApiError ? err.message : "Não foi possível carregar as configurações." });
      });
  }, []);

  async function toggleSystem() {
    if (state.status !== "loaded" || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateApprovalSettings({ approvalEnabled: !state.settings.approval_enabled });
      setState({ status: "loaded", settings: updated });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível atualizar.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleAction(key: keyof ApprovalSettings["required_actions"]) {
    if (state.status !== "loaded" || busy) return;
    setBusy(true);
    setError(null);
    try {
      const requiredActions = { ...state.settings.required_actions, [key]: !state.settings.required_actions[key] };
      const updated = await updateApprovalSettings({ requiredActions });
      setState({ status: "loaded", settings: updated });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível atualizar.");
    } finally {
      setBusy(false);
    }
  }

  async function saveExpiration() {
    const days = Number(expirationDays);
    if (!Number.isInteger(days) || days < 1 || days > 30) {
      setError("Expiration must be a whole number between 1 and 30 days.");
      return;
    }
    setSavingExpiration(true);
    setError(null);
    try {
      const updated = await updateApprovalSettings({ defaultExpirationDays: days });
      setState({ status: "loaded", settings: updated });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível atualizar.");
    } finally {
      setSavingExpiration(false);
    }
  }

  const totalOn = state.status === "loaded" ? Object.values(state.settings.required_actions).filter(Boolean).length : 0;

  return (
    <div className="page">
      <div className="page-head">
        <div className="h">
          <div className="page-title">Approval settings</div>
          <div className="page-desc">Controla quais ações do sistema exigem revisão antes de executar.</div>
        </div>
      </div>

      {error && <div className="field-hint" style={{ color: "var(--danger)", marginBottom: 16 }}>{error}</div>}

      {state.status === "loading" && <div className="empty">Carregando…</div>}
      {state.status === "error" && <div className="empty">{state.message}</div>}

      {state.status === "loaded" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 640 }}>
          <div className="appr-system-row">
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 16 }}>Sistema de aprovação</div>
              <div style={{ fontSize: 13.5, color: "var(--ink-3)", marginTop: 6, lineHeight: 1.55, maxWidth: "48ch" }}>
                {state.settings.approval_enabled ? (
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
              className={"switch lg" + (state.settings.approval_enabled ? " on" : "")}
              style={{ flexShrink: 0 }}
              disabled={busy}
              onClick={toggleSystem}
            />
          </div>

          {state.settings.approval_enabled && (
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
                            className={"switch" + (state.settings.required_actions[action.key] ? " on" : "")}
                            disabled={busy}
                            onClick={() => toggleAction(action.key)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!state.settings.approval_enabled && (
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
                  onChange={(e) => setExpirationDays(e.target.value)}
                />
                <button className="btn btn-primary" onClick={saveExpiration} disabled={savingExpiration}>
                  Save
                </button>
              </div>
              <div className="field-hint">New approval requests get this many days before they expire (1–30).</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
