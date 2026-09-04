import { useCallback, useEffect, useState } from "react";
import { deleteSecretKey, generateSecretKey, listSecretKeys } from "../api/secretKeys";
import { ApiError } from "../api/client";
import { useApprovalIntercept } from "../hooks/useApprovalIntercept";
import { ApprovalInterceptModal } from "./ApprovalInterceptModal";
import { ConfirmModal } from "./ConfirmModal";
import { GeneratedKeyModal } from "./GeneratedKeyModal";
import { Icon } from "./Icon";
import { useToast } from "./ToastProvider";
import { formatAuditWhen } from "../lib/auditEvents";
import type { SecretKey } from "../types/secretKey";

interface SecretKeySectionProps {
  applicationId: string;
  // Nome só pra exibição no intercept de aprovação ("Target"), não usado em nenhuma chamada de
  // API (a seção sempre opera pelo applicationId).
  applicationName?: string;
  canManage: boolean;
  isRoot: boolean;
  // A sidebar mostra um indicador (".key-active-dot") no item "Service key" quando a aplicação
  // aberta tem uma chave ativa — só esta seção sabe isso (dono único do fetch), então avisa o
  // pai em vez de duplicar a chamada a GET /secret-keys.
  onKeyPresenceChange?: (hasKey: boolean) => void;
  // generate-secret/DELETE são approval-aware — mesmo mecanismo de aviso inline usado por
  // CreateToggleModal/EditToggleDrawer via ApplicationDetailScreen#pendingNotice.
  onPendingApproval?: (actionType: string) => void;
}

type State =
  | { status: "loading" }
  | { status: "loaded"; current: SecretKey | null; previous: SecretKey | null }
  | { status: "error"; message: string };

// Rodapé de confirmação exigido antes de agir na chave ATUAL (rotacionar ou revogar) — a chave
// PREVIOUS não passa por isso, ver handleRevokePrevious.
type Confirming = "rotate" | "revokeCurrent" | null;

// v2.6 §5.1: rotação com janela de overlap — uma aplicação pode ter até 2 chaves vivas ao mesmo
// tempo (current + previous), a anterior continuando a autenticar até ser revogada. Diferente do
// modelo anterior desta reescrita, que assumia no máximo 1 chave por aplicação.
export function SecretKeySection({ applicationId, applicationName, canManage, isRoot, onKeyPresenceChange, onPendingApproval }: SecretKeySectionProps) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  // A chave revelada veio de uma solicitação sob aprovação (generate-secret 202 com plain_key) —
  // muda o texto do modal pra deixar claro que ela ainda não está ativa.
  const [revealedKeyPending, setRevealedKeyPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const toast = useToast();
  const { intercept, busy: interceptBusy, guard, cancel: cancelIntercept, confirm: confirmIntercept } = useApprovalIntercept(isRoot);

  const load = useCallback(() => {
    listSecretKeys(applicationId)
      .then((keys) => {
        const current = keys.find((k) => k.is_current) ?? null;
        const previous = keys.find((k) => !k.is_current) ?? null;
        setState({ status: "loaded", current, previous });
        onKeyPresenceChange?.(keys.length > 0);
      })
      .catch((err) => {
        setState({ status: "error", message: err instanceof ApiError ? err.message : "Não foi possível carregar a chave." });
      });
  }, [applicationId, onKeyPresenceChange]);

  useEffect(() => {
    load();
  }, [load]);

  async function doGenerate() {
    setConfirming(null);
    await guard("secret_key_create", { actionDesc: "Generate secret key", path: applicationName }, async () => {
      setBusy(true);
      try {
        const result = await generateSecretKey(applicationId);
        if (result.kind === "pending_approval") {
          onPendingApproval?.(result.actionType);
          // A chave já existe (inativa) e result.plainKey é a única chance de vê-la — mesmo assim,
          // avisa que a ação está pendente (onPendingApproval acima) e NÃO recarrega a lista (a
          // chave pendente não aparece em GET .../secret-keys até ser aprovada).
          if (result.plainKey) {
            setRevealedKeyPending(true);
            setRevealedKey(result.plainKey);
          }
          return;
        }
        setRevealedKeyPending(false);
        setRevealedKey(result.plainKey);
        load();
      } catch (err) {
        setState({ status: "error", message: err instanceof ApiError ? err.message : "Não foi possível gerar a chave." });
      } finally {
        setBusy(false);
      }
    });
  }

  // v2.6 §5.1 (confirmado no protótipo real, app.jsx#handleGenerateKey): gerar a PRIMEIRA chave
  // de uma aplicação vai direto (nada com que sobrepor ainda); gerar quando já existe uma chave
  // viva (current OU previous) pede confirmação primeiro ("Rotate service key?") — a chave atual
  // não é revogada automaticamente, então o usuário precisa entender isso antes de prosseguir.
  function handleGenerateClick() {
    if (state.status === "loaded" && (state.current || state.previous)) {
      setConfirming("rotate");
      return;
    }
    doGenerate();
  }

  async function doRevokeCurrent(id: string) {
    setConfirming(null);
    await guard("secret_key_delete", { actionDesc: "Delete secret key", path: applicationName }, async () => {
      setBusy(true);
      try {
        const result = await deleteSecretKey(id);
        if (result.kind === "pending_approval") {
          onPendingApproval?.(result.actionType);
          return;
        }
        load();
        toast("Service key revoked");
      } catch (err) {
        setState({ status: "error", message: err instanceof ApiError ? err.message : "Não foi possível remover a chave." });
      } finally {
        setBusy(false);
      }
    });
  }

  // v2.6 §5.1: revogar a chave PREVIOUS é imediato, sem confirmação (confirmado no protótipo
  // real: revokePreviousKey() é chamado direto do botão do aviso de overlap) — menor risco que
  // revogar a atual, já que a atual continua funcionando normalmente depois.
  async function handleRevokePrevious(id: string) {
    await guard("secret_key_delete", { actionDesc: "Delete secret key", path: applicationName }, async () => {
      setBusy(true);
      try {
        const result = await deleteSecretKey(id);
        if (result.kind === "pending_approval") {
          onPendingApproval?.(result.actionType);
          return;
        }
        load();
        toast("Previous key revoked");
      } catch (err) {
        setState({ status: "error", message: err instanceof ApiError ? err.message : "Não foi possível remover a chave." });
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <div>
      <div className="keys-head">
        <div>
          <div className="section-h">Service key</div>
          <div className="field-hint" style={{ marginTop: 5 }}>
            One secret key per application. Shown only once when generated — cannot be retrieved later.
          </div>
        </div>
        {state.status === "loaded" && state.current && canManage && (
          <button className="btn btn-soft btn-sm" onClick={handleGenerateClick} disabled={busy}>
            <Icon name="refresh" size={14} /> Rotate key
          </button>
        )}
      </div>

      {state.status === "loading" && <div className="empty-ph">Carregando…</div>}
      {state.status === "error" && <div className="field-hint danger">{state.message}</div>}

      {state.status === "loaded" && !state.current && (
        <div className="key-empty">
          <div className="key-empty-icon">
            <Icon name="key" size={28} />
          </div>
          <div className="key-empty-t">No service key</div>
          <div className="key-empty-d">Generate a secret key to connect your services to this application.</div>
          {canManage && (
            <button className="btn btn-primary" style={{ marginTop: 22 }} onClick={handleGenerateClick} disabled={busy}>
              <Icon name="plus" size={16} /> Generate service key
            </button>
          )}
        </div>
      )}

      {state.status === "loaded" && state.current && (
        <div className="key-single">
          <div className="key-single-head">
            <div className="ks-icon">
              <Icon name="key" size={17} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Confirmado no protótipo real (get_screen_full("KeysView")): label estático
                  "Service key", não o nome dinâmico da chave — o backend também nunca deixou esse
                  campo variar de fato (sempre "API Access Key"). "Last used" agora é tracking
                  real (v2.6 §5.6) — nunca mais "(demo — not tracked)". */}
              <div className="ks-name">Service key</div>
              <div className="ks-meta">
                Created {new Date(state.current.created_at).toLocaleDateString()} · Last used{" "}
                {state.current.last_used_at ? formatAuditWhen(state.current.last_used_at) : "never"}
              </div>
            </div>
            {canManage && (
              <button className="btn btn-danger btn-sm" onClick={() => setConfirming("revokeCurrent")} disabled={busy}>
                <Icon name="trash" size={14} /> Revoke
              </button>
            )}
          </div>
        </div>
      )}

      {state.status === "loaded" && state.previous && (
        <div className="notice" style={{ marginTop: 16 }}>
          <Icon name="clock" size={16} />
          <span style={{ flex: 1 }}>
            The <b>previous key</b> is still valid during the rotation overlap window, so services that haven't switched
            over yet won't break. Revoke it once every consumer is updated.
          </span>
          {canManage && (
            <button
              className="btn btn-danger btn-sm"
              style={{ flexShrink: 0 }}
              onClick={() => handleRevokePrevious(state.previous!.id)}
              disabled={busy}
            >
              Revoke previous now
            </button>
          )}
        </div>
      )}

      {state.status === "loaded" && state.current && canManage && (
        <div className="key-lost">
          <div className="key-lost-icon">
            <Icon name="refresh" size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="key-lost-t">Lost the key?</div>
            <div className="key-lost-d">
              Generate a new one. The current key keeps working during a manual overlap window — revoke it yourself once
              every consumer is updated.
            </div>
          </div>
          <button className="btn btn-soft btn-sm" onClick={handleGenerateClick} disabled={busy}>
            <Icon name="key" size={14} /> Generate new key
          </button>
        </div>
      )}

      {confirming === "rotate" && (
        <ConfirmModal
          danger
          icon="key"
          title="Rotate service key?"
          sub="The current key keeps working during a manual overlap window"
          confirmLabel="Generate new key"
          onClose={() => setConfirming(null)}
          onConfirm={doGenerate}
          body={
            <div className="skey-warn">
              <Icon name="warn" size={16} />
              <span>
                A new key is generated now. The current one is <b>not</b> revoked automatically — update your consumers,
                then revoke it yourself from the Service key tab.
              </span>
            </div>
          }
        />
      )}

      {confirming === "revokeCurrent" && state.status === "loaded" && state.current && (
        <ConfirmModal
          danger
          icon="key"
          title="Revoke service key?"
          sub="All services using this key will lose access"
          confirmLabel="Revoke key"
          onClose={() => setConfirming(null)}
          onConfirm={() => doRevokeCurrent(state.current!.id)}
          body={
            <div className="skey-warn">
              <Icon name="warn" size={16} />
              <span>
                This will <b>immediately block</b> all services using this key. You will need to generate a new key to
                restore access.
              </span>
            </div>
          }
        />
      )}

      {revealedKey && (
        <GeneratedKeyModal
          plainKey={revealedKey}
          pendingApproval={revealedKeyPending}
          onClose={() => setRevealedKey(null)}
        />
      )}

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
    </div>
  );
}
