import { useCallback, useEffect, useState } from "react";
import { deleteSecretKey, generateSecretKey, listSecretKeys } from "../api/secretKeys";
import { ApiError } from "../api/client";
import { GeneratedKeyModal } from "./GeneratedKeyModal";
import type { SecretKey } from "../types/secretKey";

interface SecretKeySectionProps {
  applicationId: string;
  canManage: boolean;
  // A sidebar mostra um indicador (".key-active-dot") no item "Service key" quando a aplicação
  // aberta tem uma chave ativa — só esta seção sabe isso (dono único do fetch), então avisa o
  // pai em vez de duplicar a chamada a GET /secret-keys.
  onKeyPresenceChange?: (hasKey: boolean) => void;
}

type State = { status: "loading" } | { status: "loaded"; key: SecretKey | null } | { status: "error"; message: string };

// Uma aplicação tem no máximo uma secret key ativa por vez — "gerar" no servidor é
// sempre "regerar" (apaga as anteriores primeiro), então só mostramos a mais recente.
export function SecretKeySection({ applicationId, canManage, onKeyPresenceChange }: SecretKeySectionProps) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      const generated = await generateSecretKey(applicationId);
      setRevealedKey(generated.plainKey);
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
      await deleteSecretKey(id);
      load();
    } catch (err) {
      setState({ status: "error", message: err instanceof ApiError ? err.message : "Não foi possível remover a chave." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="section-h">Service key</div>

      {state.status === "loading" && <div className="empty-ph">Carregando…</div>}
      {state.status === "error" && <div className="field-hint" style={{ color: "var(--danger)" }}>{state.message}</div>}

      {state.status === "loaded" && !state.key && (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="field-hint">Nenhuma chave gerada ainda.</div>
          {canManage && (
            <button className="btn btn-soft btn-sm" onClick={handleGenerate} disabled={busy}>
              Generate key
            </button>
          )}
        </div>
      )}

      {state.status === "loaded" && state.key && (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="badge mono">{state.key.name}</span>
          {canManage && (
            <>
              <button className="btn btn-soft btn-sm" onClick={handleGenerate} disabled={busy}>
                Regenerate
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(state.key!.id)} disabled={busy}>
                Delete
              </button>
            </>
          )}
        </div>
      )}

      {revealedKey && <GeneratedKeyModal plainKey={revealedKey} onClose={() => setRevealedKey(null)} />}
    </div>
  );
}
