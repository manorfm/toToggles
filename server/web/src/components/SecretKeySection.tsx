import { useCallback, useEffect, useState } from "react";
import { deleteSecretKey, generateSecretKey, listSecretKeys } from "../api/secretKeys";
import { ApiError } from "../api/client";
import { GeneratedKeyModal } from "./GeneratedKeyModal";
import { Icon } from "./Icon";
import { useToast } from "./ToastProvider";
import type { SecretKey } from "../types/secretKey";

interface SecretKeySectionProps {
  applicationId: string;
  canManage: boolean;
  // A sidebar mostra um indicador (".key-active-dot") no item "Service key" quando a aplicação
  // aberta tem uma chave ativa — só esta seção sabe isso (dono único do fetch), então avisa o
  // pai em vez de duplicar a chamada a GET /secret-keys.
  onKeyPresenceChange?: (hasKey: boolean) => void;
  // generate-secret/DELETE são approval-aware — mesmo mecanismo de aviso inline usado por
  // CreateToggleModal/EditToggleDrawer via ApplicationDetailScreen#pendingNotice.
  onPendingApproval?: (actionType: string) => void;
}

type State = { status: "loading" } | { status: "loaded"; key: SecretKey | null } | { status: "error"; message: string };

// Uma aplicação tem no máximo uma secret key ativa por vez — "gerar" no servidor é
// sempre "regerar" (apaga as anteriores primeiro), então só mostramos a mais recente.
export function SecretKeySection({ applicationId, canManage, onKeyPresenceChange, onPendingApproval }: SecretKeySectionProps) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  // A chave revelada veio de uma solicitação sob aprovação (generate-secret 202 com plain_key) —
  // muda o texto do modal pra deixar claro que ela ainda não está ativa.
  const [revealedKeyPending, setRevealedKeyPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    listSecretKeys(applicationId)
      .then((keys) => {
        setState({ status: "loaded", key: keys[0] ?? null });
        onKeyPresenceChange?.(keys.length > 0);
      })
      .catch((err) => {
        setState({ status: "error", message: err instanceof ApiError ? err.message : "Não foi possível carregar a chave." });
      });
  }, [applicationId, onKeyPresenceChange]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleGenerate() {
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
  }

  async function handleDelete(id: string) {
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
  }

  const hasKey = state.status === "loaded" && !!state.key;

  return (
    <div>
      <div className="keys-head">
        <div>
          <div className="section-h">Service key</div>
          <div className="field-hint" style={{ marginTop: 5 }}>
            One secret key per application. Shown only once when generated — cannot be retrieved later.
          </div>
        </div>
        {hasKey && canManage && (
          <button className="btn btn-soft btn-sm" onClick={handleGenerate} disabled={busy}>
            <Icon name="refresh" size={14} /> Rotate key
          </button>
        )}
      </div>

      {state.status === "loading" && <div className="empty-ph">Carregando…</div>}
      {state.status === "error" && <div className="field-hint" style={{ color: "var(--danger)" }}>{state.message}</div>}

      {state.status === "loaded" && !state.key && (
        <div className="key-empty">
          <div className="key-empty-icon">
            <Icon name="key" size={28} />
          </div>
          <div className="key-empty-t">No service key</div>
          <div className="key-empty-d">Generate a secret key to connect your services to this application.</div>
          {canManage && (
            <button className="btn btn-primary" style={{ marginTop: 22 }} onClick={handleGenerate} disabled={busy}>
              <Icon name="plus" size={16} /> Generate service key
            </button>
          )}
        </div>
      )}

      {state.status === "loaded" && state.key && (
        <div className="key-single">
          <div className="key-single-head">
            <div className="ks-icon">
              <Icon name="key" size={17} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="ks-name">{state.key.name}</div>
              <div className="ks-meta">Created {new Date(state.key.created_at).toLocaleDateString()}</div>
            </div>
            {canManage && (
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(state.key!.id)} disabled={busy}>
                <Icon name="trash" size={14} /> Revoke
              </button>
            )}
          </div>
        </div>
      )}

      {state.status === "loaded" && state.key && canManage && (
        <div className="key-lost">
          <div className="key-lost-icon">
            <Icon name="refresh" size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="key-lost-t">Lost the key?</div>
            <div className="key-lost-d">
              Generate a new one. The current key is revoked immediately and any service still using it loses access.
            </div>
          </div>
          <button className="btn btn-soft btn-sm" onClick={handleGenerate} disabled={busy}>
            <Icon name="key" size={14} /> Generate new key
          </button>
        </div>
      )}

      {revealedKey && (
        <GeneratedKeyModal
          plainKey={revealedKey}
          pendingApproval={revealedKeyPending}
          onClose={() => setRevealedKey(null)}
        />
      )}
    </div>
  );
}
