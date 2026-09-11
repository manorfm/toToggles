import { useEffect, useState } from "react";
import { ApprovalInterceptModal } from "./ApprovalInterceptModal";
import { DottedPath } from "./DottedPath";
import { Icon } from "./Icon";
import { ApiError } from "../api/client";
import { getToggle, updateToggleRule } from "../api/toggles";
import { useToast } from "./ToastProvider";
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
// porquê get_full_jsx("EditDrawer") sozinho não bastava aqui, na época, pra RULE_TYPES).
// Reauditado numa rodada posterior contra `get_full_jsx("EditDrawer")` (o próprio JSX de retorno
// já funcionava sem o bundle desde sempre — só o array RULE_TYPES é que precisava do decode):
// batia quase byte a byte, com um único gap real — `drawer-path` renderizava o path como string
// crua em vez de segmentos com `.dot` entre eles (mesmo padrão já usado em CreateToggleModal,
// extraído pra components/DottedPath.tsx pra não duplicar a lógica uma terceira vez).
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
  const [contextKey, setContextKey] = useState("");
  // "time" doesn't use the generic free-text ruleValue input (see below) — two native
  // <input type="time"> fields compose it instead, which both gets a real picker and guarantees
  // the zero-padded "HH:mm" format the server now validates (activation_rule.go#ValidateRule).
  const [timeStart, setTimeStart] = useState("");
  const [timeEnd, setTimeEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { intercept, busy: interceptBusy, guard, cancel: cancelIntercept, confirm: confirmIntercept } = useApprovalIntercept(isRoot);
  const toast = useToast();

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
        setContextKey(toggle.activation_rule?.config?.context_key ?? RULE_TYPES.find((r) => r.type === ruleType)?.contextKey ?? "");
        if (ruleType === "time") {
          const [start, end] = ruleValue.split("-");
          setTimeStart(start ?? "");
          setTimeEnd(end ?? "");
        }
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
  // The single source of truth for "time"'s value is the pair of pickers, not ruleValue — see
  // the timeStart/timeEnd state declaration above.
  const effectiveRuleValue = ruleType === "time" ? (timeStart && timeEnd ? `${timeStart}-${timeEnd}` : "") : ruleValue;

  function selectRuleType(type: ActivationRuleType) {
    // A stale value from a previously selected type must never survive a type switch — e.g.
    // typing "BR" while "Country" is selected, then switching to "Percentage" without touching
    // the value field again, used to leave "BR" sitting in the request body (the server rejects
    // it, but only after a round trip with no client-side warning).
    setRuleType(type);
    setRuleValue("");
    setTimeStart("");
    setTimeEnd("");
    setContextKey(RULE_TYPES.find((r) => r.type === type)?.contextKey ?? "");
    setError(null);
  }

  async function save() {
    if (loadState.status !== "loaded") return;
    if (ruleOn && (!ruleType || !effectiveRuleValue.trim() || (selectedRuleMeta?.contextKey && !contextKey.trim()))) {
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
          activationRule: ruleOn && ruleType ? { type: ruleType, value: effectiveRuleValue.trim(), config: selectedRuleMeta?.contextKey ? { context_key: contextKey.trim() } : null } : undefined,
        });
        if (result.kind === "pending_approval") {
          onPendingApproval(result.actionType);
        } else {
          onSaved({
            enabled: loadState.toggle.enabled,
            hasActivationRule: loadState.toggle.has_activation_rule,
            activationRule: loadState.toggle.has_activation_rule ? loadState.toggle.activation_rule : null,
          });
          // Advisory only (server: entity.Toggle#RuleContextWarning) — the save already
          // succeeded, this never blocks it. See docs/sdd/rollout-consistency-guardrails.md
          // Wave 3. Surfaced as a toast (not an in-drawer notice) since the drawer closes right
          // after a successful save, same reasoning as every other post-save toast in this file.
          if (result.toggle.rule_context_warning) {
            toast(result.toggle.rule_context_warning);
          }
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
          {loadState.status === "loaded" && (
            <div className="drawer-path">
              <DottedPath segments={loadState.toggle.path.split(".")} />
            </div>
          )}
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
                          onClick={() => selectRuleType(r.type)}
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
                        {selectedRuleMeta.type === "time" ? (
                          <>
                            <label className="field-label" htmlFor="rule-time-start">
                              Time window (daily, server timezone)
                            </label>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <input
                                className="input mono"
                                type="time"
                                id="rule-time-start"
                                aria-label="Start time"
                                value={timeStart}
                                onChange={(e) => {
                                  setTimeStart(e.target.value);
                                  setError(null);
                                }}
                              />
                              <span>–</span>
                              <input
                                className="input mono"
                                type="time"
                                id="rule-time-end"
                                aria-label="End time"
                                value={timeEnd}
                                onChange={(e) => {
                                  setTimeEnd(e.target.value);
                                  setError(null);
                                }}
                              />
                            </div>
                          </>
                        ) : (
                          <>
                            <label className="field-label" htmlFor="rule-value">
                              {selectedRuleMeta.name} value
                            </label>
                            <input
                              className="input mono"
                              id="rule-value"
                              type={selectedRuleMeta.type === "percentage" ? "number" : "text"}
                              min={selectedRuleMeta.type === "percentage" ? 0 : undefined}
                              max={selectedRuleMeta.type === "percentage" ? 100 : undefined}
                              step={selectedRuleMeta.type === "percentage" ? "0.01" : undefined}
                              placeholder={selectedRuleMeta.placeholder}
                              value={ruleValue}
                              onChange={(e) => {
                                setRuleValue(e.target.value);
                                setError(null);
                              }}
                            />
                          </>
                        )}
                        <div className="field-hint">{selectedRuleMeta.hint}</div>
                        {selectedRuleMeta.contextKey && (
                          <>
                            <label className="field-label" htmlFor="rule-context-key" style={{ marginTop: 12 }}>
                              Context key
                            </label>
                            <input
                              className="input mono"
                              id="rule-context-key"
                              value={contextKey}
                              disabled={!selectedRuleMeta.contextKeyEditable}
                              placeholder={selectedRuleMeta.contextKeyEditable ? "rollout_key or attributes.account_id" : undefined}
                              onChange={(e) => setContextKey(e.target.value)}
                            />
                            <div className="field-hint">
                              {selectedRuleMeta.contextKeyEditable
                                ? "The name your app's SDK integration must supply in its request context for this exact value — configure that in your SDK integration, not here."
                                : `Fixed for this rule type: the SDK always resolves "${selectedRuleMeta.contextKey}" automatically. Nothing to configure here.`}
                            </div>
                          </>
                        )}
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
