import { useCallback, useEffect, useState } from "react";
import { ApprovalRow } from "../components/ApprovalRow";
import { ApprovalSettingsPanel } from "../components/ApprovalSettingsPanel";
import { Icon } from "../components/Icon";
import { RejectApprovalModal } from "../components/RejectApprovalModal";
import { useToast } from "../components/ToastProvider";
import { ApiError } from "../api/client";
import {
  approveApproval,
  executeApproval,
  listApprovableApprovals,
  listMyApprovals,
  listPendingApprovals,
} from "../api/approvals";
import { getApprovalSettings, updateApprovalSettings } from "../api/approvalSettings";
import { useAppUser } from "../hooks/useAppUser";
import type { ApprovalRequest } from "../types/approval";
import type { ApprovalActionKey, ApprovalSettings } from "../types/approvalSettings";

type Tab = "pending" | "mine" | "settings";

type RequestsState =
  | { status: "loading" }
  | { status: "loaded"; requests: ApprovalRequest[] }
  | { status: "error"; message: string };

type SettingsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; settings: ApprovalSettings }
  | { status: "error"; message: string };

// Adaptado de get_screen_full("ApprovalsView") — uma ÚNICA tela com abas (Pending/Mine/Settings),
// não três rotas separadas como numa fase anterior desta reescrita: "Configurar" no banner de
// status (root only) só troca de aba, nunca navega. ApprovalSettingsView é literalmente uma aba
// desta tela no protótipo, não um destino de navegação próprio — settings/get_full_jsx confirma
// o componente sendo renderizado inline quando tab === "settings".
export function ApprovalsScreen() {
  const user = useAppUser();
  const toast = useToast();
  const isRoot = user.role === "root";
  const [tab, setTab] = useState<Tab>("pending");

  const [requestsState, setRequestsState] = useState<RequestsState>({ status: "loading" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [needsExecuteRetry, setNeedsExecuteRetry] = useState<Set<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState<ApprovalRequest | null>(null);

  const [settingsState, setSettingsState] = useState<SettingsState>(isRoot ? { status: "loading" } : { status: "idle" });
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [expirationDays, setExpirationDays] = useState("");
  const [savingExpiration, setSavingExpiration] = useState(false);

  const loadRequests = useCallback(() => {
    const fetcher = tab === "mine" ? listMyApprovals : isRoot ? listPendingApprovals : listApprovableApprovals;
    setRequestsState({ status: "loading" });
    fetcher()
      .then((requests) => setRequestsState({ status: "loaded", requests }))
      .catch((err) => {
        setRequestsState({ status: "error", message: err instanceof ApiError ? err.message : "Não foi possível carregar as solicitações." });
      });
  }, [tab, isRoot]);

  useEffect(() => {
    if (tab === "settings") return;
    loadRequests();
  }, [tab, loadRequests]);

  useEffect(() => {
    if (!isRoot) return;
    getApprovalSettings()
      .then((settings) => {
        setSettingsState({ status: "loaded", settings });
        setExpirationDays(String(settings.default_expiration_days));
      })
      .catch((err) => {
        setSettingsState({ status: "error", message: err instanceof ApiError ? err.message : "Não foi possível carregar as configurações." });
      });
  }, [isRoot]);

  function clearRowError(id: string) {
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function handleApprove(id: string) {
    setBusyId(id);
    clearRowError(id);
    try {
      await approveApproval(id);
      try {
        await executeApproval(id);
        setNeedsExecuteRetry((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        loadRequests();
        toast("Approved — action executed");
      } catch (err) {
        setNeedsExecuteRetry((prev) => new Set(prev).add(id));
        setRowErrors((prev) => ({
          ...prev,
          [id]: `Aprovado, mas falhou ao aplicar: ${err instanceof ApiError ? err.message : "erro desconhecido"}.`,
        }));
      }
    } catch (err) {
      setRowErrors((prev) => ({ ...prev, [id]: err instanceof ApiError ? err.message : "Não foi possível aprovar." }));
    } finally {
      setBusyId(null);
    }
  }

  async function handleRetryExecute(id: string) {
    setBusyId(id);
    try {
      await executeApproval(id);
      setNeedsExecuteRetry((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      clearRowError(id);
      loadRequests();
      toast("Approved — action executed");
    } catch (err) {
      setRowErrors((prev) => ({ ...prev, [id]: err instanceof ApiError ? err.message : "Não foi possível aplicar a mudança." }));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleSystem() {
    if (settingsState.status !== "loaded" || settingsBusy) return;
    setSettingsBusy(true);
    setSettingsError(null);
    try {
      const enabling = !settingsState.settings.approval_enabled;
      const updated = await updateApprovalSettings({ approvalEnabled: enabling });
      setSettingsState({ status: "loaded", settings: updated });
      toast(enabling ? "Approval system enabled" : "Approval system disabled");
    } catch (err) {
      setSettingsError(err instanceof ApiError ? err.message : "Não foi possível atualizar.");
    } finally {
      setSettingsBusy(false);
    }
  }

  async function toggleAction(key: ApprovalActionKey) {
    if (settingsState.status !== "loaded" || settingsBusy) return;
    setSettingsBusy(true);
    setSettingsError(null);
    try {
      const requiredActions = { ...settingsState.settings.required_actions, [key]: !settingsState.settings.required_actions[key] };
      const updated = await updateApprovalSettings({ requiredActions });
      setSettingsState({ status: "loaded", settings: updated });
    } catch (err) {
      setSettingsError(err instanceof ApiError ? err.message : "Não foi possível atualizar.");
    } finally {
      setSettingsBusy(false);
    }
  }

  async function saveExpiration() {
    const days = Number(expirationDays);
    if (!Number.isInteger(days) || days < 1 || days > 30) {
      setSettingsError("Expiration must be a whole number between 1 and 30 days.");
      return;
    }
    setSavingExpiration(true);
    setSettingsError(null);
    try {
      const updated = await updateApprovalSettings({ defaultExpirationDays: days });
      setSettingsState({ status: "loaded", settings: updated });
      toast("Changes saved");
    } catch (err) {
      setSettingsError(err instanceof ApiError ? err.message : "Não foi possível atualizar.");
    } finally {
      setSavingExpiration(false);
    }
  }

  const totalActionsOn =
    settingsState.status === "loaded" ? Object.values(settingsState.settings.required_actions).filter(Boolean).length : 0;

  return (
    <div className="page">
      <div className="page-head">
        <div className="h">
          <div className="page-title">Approval Management</div>
          <div className="page-desc">
            {isRoot
              ? "Gerencie o sistema de aprovação, configure ações e decida solicitações pendentes."
              : "Revise solicitações do seu time e acompanhe as suas próprias requisições."}
          </div>
        </div>
      </div>

      {isRoot && settingsState.status === "loaded" && (
        <div className={"appr-system-banner" + (settingsState.settings.approval_enabled ? " on" : "")}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5 }}>
            <Icon name={settingsState.settings.approval_enabled ? "check" : "warn"} size={16} />
            <span>
              Sistema <b>{settingsState.settings.approval_enabled ? "ativo" : "desativado"}</b>
              {settingsState.settings.approval_enabled && ` · ${totalActionsOn} ações configuradas`}
            </span>
          </div>
          <button className="btn btn-soft btn-sm" onClick={() => setTab("settings")}>
            <Icon name="settings" size={14} /> Configurar
          </button>
        </div>
      )}

      <div className="audit-filter" style={{ marginBottom: 20 }}>
        <button className={"chip" + (tab === "pending" ? " on" : "")} onClick={() => setTab("pending")}>
          {isRoot ? "Pending" : "Approvable"}
        </button>
        <button className={"chip" + (tab === "mine" ? " on" : "")} onClick={() => setTab("mine")}>
          Mine
        </button>
        {isRoot && (
          <button className={"chip" + (tab === "settings" ? " on" : "")} onClick={() => setTab("settings")}>
            Settings
          </button>
        )}
      </div>

      {tab === "settings" ? (
        <>
          {settingsState.status === "loading" && <div className="empty">Carregando…</div>}
          {settingsState.status === "error" && <div className="empty">{settingsState.message}</div>}
          {settingsState.status === "loaded" && (
            <ApprovalSettingsPanel
              settings={settingsState.settings}
              busy={settingsBusy}
              error={settingsError}
              expirationDays={expirationDays}
              savingExpiration={savingExpiration}
              onToggleSystem={toggleSystem}
              onToggleAction={toggleAction}
              onExpirationDaysChange={setExpirationDays}
              onSaveExpiration={saveExpiration}
            />
          )}
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {requestsState.status === "loading" && <div className="empty">Carregando…</div>}
          {requestsState.status === "error" && <div className="empty">{requestsState.message}</div>}
          {requestsState.status === "loaded" && requestsState.requests.length === 0 && (
            <div className="empty">
              <Icon name={tab === "pending" ? "check" : "user"} size={40} />
              <div className="et">{tab === "pending" ? "Tudo limpo" : "Nenhum registro"}</div>
              <div className="ed">{tab === "pending" ? "Nenhuma solicitação pendente." : "Nenhuma entrada aqui ainda."}</div>
            </div>
          )}

          {requestsState.status === "loaded" &&
            requestsState.requests.map((request) => (
              <div key={request.id}>
                {needsExecuteRetry.has(request.id) ? (
                  <div className="appr-row">
                    <div style={{ flex: 1 }}>
                      <span className="appr-action">{request.toggle_path ?? request.application_name ?? request.id}</span>
                      {rowErrors[request.id] && (
                        <div className="field-hint danger" style={{ marginTop: 6 }}>
                          {rowErrors[request.id]}
                        </div>
                      )}
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => handleRetryExecute(request.id)} disabled={busyId === request.id}>
                      Retry
                    </button>
                  </div>
                ) : (
                  <>
                    <ApprovalRow
                      request={request}
                      onApprove={() => handleApprove(request.id)}
                      onReject={() => setRejecting(request)}
                      busy={busyId === request.id}
                      readOnly={tab === "mine"}
                      isOwn={tab === "mine"}
                    />
                    {rowErrors[request.id] && (
                      <div className="field-hint danger" style={{ marginTop: 6 }}>
                        {rowErrors[request.id]}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
        </div>
      )}

      {rejecting && (
        <RejectApprovalModal
          request={rejecting}
          onClose={() => setRejecting(null)}
          onRejected={() => {
            loadRequests();
            toast("Request rejected");
          }}
        />
      )}
    </div>
  );
}
