import { useEffect, useState } from "react";
import { ApprovalInterceptModal } from "./ApprovalInterceptModal";
import { Icon } from "./Icon";
import { ApiError } from "../api/client";
import { getToggle, updateToggleRule } from "../api/toggles";
import { useApprovalIntercept } from "../hooks/useApprovalIntercept";
import { RULE_TYPES, deriveInitialRuleState } from "../lib/activationRuleTypes";
import type { ActivationRule, ActivationRuleType, ToggleDetail } from "../types/toggle";

// Snapshot pré-edição de um toggle (bit próprio + regra) — capturado no load do drawer, antes de
// qualquer edição local. Usado pra montar o Undo do toast "Changes saved" (v2.6 §4.3): reaplicar
// exatamente esse estado desfaz a mudança, sem precisar guardar um histórico maior.
export interface ToggleRuleSnapshot {
  enabled: boolean;
  hasActivationRule: boolean;
  activationRule: ActivationRule | null;
}

interface EditToggleDrawerProps {
  applicationId: string;
  toggleId: string;
  childrenCount: number;
  ancestorsOn: boolean;
  blockerSeg: string | null;
  isRoot: boolean;
  onClose: () => void;
  onSaved: (previous: ToggleRuleSnapshot) => void;
  onPendingApproval: (actionType: string) => void;
}

type LoadState = { status: "loading" } | { status: "loaded"; toggle: ToggleDetail } | { status: "error"; message: string };

// Adaptado do EditDrawer real (decodificado do bundle — ver lib/activationRuleTypes.ts pro
// porquê get_full_jsx("EditDrawer") sozinho não bastava aqui).
export function EditToggleDrawer({
  applicationId,
  toggleId,
  childrenCount,
  ancestorsOn,
  blockerSeg,
  isRoot,
  onClose,
  onSaved,
  onPendingApproval,
}: EditToggleDrawerProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [enabled, setEnabled] = useState(true);
  const [ruleOn, setRuleOn] = useState(false);
  const [ruleType, setRuleType] = useState<ActivationRuleType | null>(null);
  const [ruleValue, setRuleValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { intercept, busy: interceptBusy, guard, cancel: cancelIntercept, confirm: confirmIntercept } = useApprovalIntercept(isRoot);

  useEffect(() => {
    let cancelled = false;
    getToggle(applicationId, toggleId)
      .then((toggle) => {
        if (cancelled) return;
        setLoadState({ status: "loaded", toggle });
        setEnabled(toggle.enabled);
        setRuleOn(toggle.has_activation_rule);
        const { ruleType, ruleValue } = deriveInitialRuleState(toggle);
        setRuleType(ruleType);
        setRuleValue(ruleValue);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadState({ status: "error", message: err instanceof ApiError ? err.message : "Não foi possível carregar o toggle." });
      });
    return () => {
      cancelled = true;
    };
  }, [applicationId, toggleId]);

  const selectedRuleMeta = RULE_TYPES.find((r) => r.type === ruleType);
  const ineffective = enabled && !ancestorsOn;

  async function save() {
    if (loadState.status !== "loaded") return;
    if (ruleOn && (!ruleType || !ruleValue.trim())) {
      setError(`${selectedRuleMeta?.name ?? "Rule"} value is required.`);
      return;
    }

    // Mesma inferência do servidor (middleware/approval.go#getActionType): o endpoint plural
    // vira toggle_rule quando has_activation_rule vai true no corpo, senão toggle_update.
    const actionType = ruleOn ? "toggle_rule" : "toggle_update";
    const actionDesc = ruleOn ? "Change activation rule" : `${enabled ? "Enable" : "Disable"} toggle`;
    const togglePath = loadState.toggle.path;

    await guard(actionType, { actionDesc, path: togglePath }, async () => {
      setSubmitting(true);
      setError(null);
      try {
        const result = await updateToggleRule(applicationId, toggleId, {
          enabled,
          hasActivationRule: ruleOn,
          activationRule: ruleOn && ruleType ? { type: ruleType, value: ruleValue.trim() } : undefined,
        });
        if (result.kind === "pending_approval") {
          onPendingApproval(result.actionType);
        } else {
          onSaved({
            enabled: loadState.toggle.enabled,
            hasActivationRule: loadState.toggle.has_activation_rule,
            activationRule: loadState.toggle.has_activation_rule ? loadState.toggle.activation_rule : null,
          });
        }
        onClose();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Não foi possível salvar as alterações.");
      } finally {
        setSubmitting(false);
      }
    });
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-head">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div className="drawer-eyebrow">Configure toggle</div>
            <button className="icon-btn" aria-label="Close" onClick={onClose}>
              <Icon name="close" size={16} />
            </button>
          </div>
          {loadState.status === "loaded" && <div className="drawer-path">{loadState.toggle.path}</div>}
        </div>

        <div className="drawer-body">
          {loadState.status === "loading" && <div className="empty-ph">Carregando…</div>}
          {loadState.status === "error" && <div className="field-hint danger">{loadState.message}</div>}

          {loadState.status === "loaded" && (
            <>
              <div>
                <div className="section-h" style={{ marginBottom: 10 }}>
                  Status
                </div>
                <div className="row-control">
                  <button
                    role="switch"
                    aria-checked={enabled}
                    aria-label="Status"
                    className={"switch lg" + (enabled ? " on" : "")}
                    onClick={() => setEnabled(!enabled)}
                  />
                  <div className="t">
                    <div className="tt">{enabled ? "Enabled" : "Disabled"}</div>
                    <div className="td">When off, this toggle and everything beneath it goes inactive.</div>
                  </div>
                </div>
                {ineffective && (
                  <div className="notice" style={{ marginTop: 10 }}>
                    <Icon name="warn" size={16} />
                    <span>
                      This has <b>no effect right now</b> — <code className="mono">{blockerSeg}</code> above it is off. Turn that
                      on too if you want this path to actually serve.
                    </span>
                  </div>
                )}
                {childrenCount > 0 && (
                  <div className="notice" style={{ marginTop: 10 }}>
                    <Icon name="warn" size={16} />
                    <span>
                      This toggle has <b>{childrenCount}</b> child{childrenCount > 1 ? "ren" : ""}. Turning it off cascades down
                      the whole subtree.
                    </span>
                  </div>
                )}
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div className="section-h" style={{ margin: 0 }}>
                    Activation rule
                  </div>
                  <button
                    role="button"
                    aria-label="Activation rule"
                    className={"switch" + (ruleOn ? " on" : "")}
                    onClick={() => setRuleOn(!ruleOn)}
                  />
                </div>
                {!ruleOn && <div className="field-hint">Always active when enabled. Turn on to add conditional logic.</div>}
                {ruleOn && (
                  <>
                    <div className="rule-types">
                      {RULE_TYPES.map((r) => (
                        <button
                          key={r.type}
                          className={"rule-opt" + (ruleType === r.type ? " sel" : "")}
                          onClick={() => setRuleType(r.type)}
                        >
                          <Icon name={r.icon} size={16} />
                          <div>
                            <div className="rn">{r.name}</div>
                            <div className="rd">{r.description}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                    {selectedRuleMeta && (
                      <div className="field" style={{ marginTop: 14 }}>
                        <label className="field-label" htmlFor="rule-value">
                          {selectedRuleMeta.name} value
                        </label>
                        <input
                          className="input mono"
                          id="rule-value"
                          placeholder={selectedRuleMeta.placeholder}
                          value={ruleValue}
                          onChange={(e) => {
                            setRuleValue(e.target.value);
                            setError(null);
                          }}
                        />
                        <div className="field-hint">{selectedRuleMeta.hint}</div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {error && (
                <div className="field-hint danger">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        <div className="drawer-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={submitting || loadState.status !== "loaded"}>
            <Icon name="check" size={16} /> {submitting ? "Salvando…" : "Save changes"}
          </button>
        </div>
      </div>

      {intercept && (
        <ApprovalInterceptModal
          actionDesc={intercept.actionDesc}
          path={intercept.path}
          team={intercept.team}
          busy={interceptBusy}
          onCancel={cancelIntercept}
          onConfirm={confirmIntercept}
        />
      )}
    </>
  );
}
